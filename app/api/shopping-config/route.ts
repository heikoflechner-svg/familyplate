import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  let warengruppe: Record<string, string> | undefined
  let aliase: Record<string, string> | undefined
  try {
    const body = await req.json() as { warengruppe?: unknown; aliase?: unknown }
    if (body.warengruppe != null && typeof body.warengruppe === 'object' && !Array.isArray(body.warengruppe)) {
      warengruppe = body.warengruppe as Record<string, string>
    }
    if (body.aliase != null && typeof body.aliase === 'object' && !Array.isArray(body.aliase)) {
      aliase = body.aliase as Record<string, string>
    }
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  if (!warengruppe && !aliase) {
    return NextResponse.json({ error: 'Nichts zu speichern.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  const { data: callerRow } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!callerRow) {
    return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })
  }

  const familyId = callerRow.family_id as string

  const { data: profileRow } = await supabaseAdmin
    .from('family_profiles')
    .select('zutaten_laden')
    .eq('family_id', familyId)
    .maybeSingle()

  const existing = (profileRow?.zutaten_laden as Record<string, string> | null) ?? {}

  // Preserve plain (store-assignment) entries; replace only namespaced entries
  const plain = Object.fromEntries(
    Object.entries(existing).filter(([k]) => !k.startsWith('__wg.') && !k.startsWith('__alias.'))
  )
  const newWg = warengruppe !== undefined
    ? Object.fromEntries(Object.entries(warengruppe).map(([k, v]) => [`__wg.${k}`, v]))
    : Object.fromEntries(Object.entries(existing).filter(([k]) => k.startsWith('__wg.')))
  const newAlias = aliase !== undefined
    ? Object.fromEntries(Object.entries(aliase).map(([k, v]) => [`__alias.${k}`, v]))
    : Object.fromEntries(Object.entries(existing).filter(([k]) => k.startsWith('__alias.')))

  const merged = { ...plain, ...newWg, ...newAlias }

  const { error: updateError } = await supabaseAdmin
    .from('family_profiles')
    .update({ zutaten_laden: merged, updated_at: new Date().toISOString() })
    .eq('family_id', familyId)

  if (updateError) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
