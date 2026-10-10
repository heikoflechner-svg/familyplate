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

  const body = await req.json() as {
    settings: { planWE: boolean; mittagsloseTage: string[] }
    weekType: 'current' | 'next'
  }
  const { settings, weekType } = body

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  const { data: callerRow } = await supabaseAdmin
    .from('family_members')
    .select('family_id, kuerzel, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!callerRow) {
    return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })
  }

  const familyId = callerRow.family_id as string
  const callerKuerzel = callerRow.kuerzel as string
  const callerRole = callerRow.role as string

  const { data: weekPlanRow } = await supabaseAdmin
    .from('week_plans')
    .select('id, wochenchef, next_week_data')
    .eq('family_id', familyId)
    .limit(1)
    .single()

  if (!weekPlanRow) {
    return NextResponse.json({ error: 'Kein Wochenplan gefunden.' }, { status: 404 })
  }

  const isOwnerOrAdmin = callerRole === 'owner' || callerRole === 'admin'

  if (weekType === 'current') {
    const isCurrentChef = callerKuerzel === (weekPlanRow.wochenchef as string | null)
    if (!isCurrentChef && !isOwnerOrAdmin) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
    }
    const { error: updateError } = await supabaseAdmin
      .from('week_plans')
      .update({ plan_settings: settings })
      .eq('id', weekPlanRow.id as string)
      .eq('family_id', familyId)
    if (updateError) {
      return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
    }
  } else {
    const nextData = weekPlanRow.next_week_data as { wochenchef?: string } | null
    const isNextChef = !!nextData?.wochenchef && callerKuerzel === nextData.wochenchef
    if (!isNextChef && !isOwnerOrAdmin) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
    }
    const updatedNextData = { ...(nextData ?? {}), planSettings: settings }
    const { error: updateError } = await supabaseAdmin
      .from('week_plans')
      .update({ next_week_data: updatedNextData })
      .eq('id', weekPlanRow.id as string)
      .eq('family_id', familyId)
    if (updateError) {
      return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
