import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'familie'
}

function makeKuerzel(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  let familyName: string, displayName: string
  try {
    const body = await req.json()
    familyName = body.familyName?.trim() ?? ''
    displayName = body.displayName?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!familyName || !displayName) {
    return NextResponse.json({ error: 'Alle Felder sind Pflicht.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  // JWT verifizieren
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session' }, { status: 401 })
  }

  // Sicherheits-Check: Nutzer darf noch KEINER Familie angehören
  // Verhindert, dass bestehende Familien/Mitglieder verändert werden
  const { data: existing } = await supabaseAdmin
    .from('family_members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Nutzer gehört bereits einer Familie an.' }, { status: 409 })
  }

  // family_id: Slug aus Familienname, bei Kollision mit Zufallssuffix
  const baseSlug = makeSlug(familyName)
  let familyId = baseSlug
  const { data: existingFamily } = await supabaseAdmin
    .from('families')
    .select('id')
    .eq('id', familyId)
    .maybeSingle()
  if (existingFamily) {
    familyId = `${baseSlug}-${user.id.replace(/-/g, '').slice(0, 8)}`
  }

  const kuerzel = makeKuerzel(displayName)

  // Familie anlegen (nur INSERT, kein UPDATE/UPSERT)
  const { error: famError } = await supabaseAdmin
    .from('families')
    .insert({ id: familyId, name: familyName, owner_id: user.id, max_members: 6 })

  if (famError) {
    console.error('families insert:', famError)
    return NextResponse.json({ error: 'Familie konnte nicht angelegt werden.' }, { status: 500 })
  }

  // Owner-Mitglied anlegen (nur INSERT, kein UPDATE/UPSERT)
  const { error: memberError } = await supabaseAdmin
    .from('family_members')
    .insert({
      family_id: familyId,
      user_id: user.id,
      role: 'owner',
      display_name: displayName,
      kuerzel,
      email: user.email,
    })

  if (memberError) {
    // Rollback: angelegte Familie wieder entfernen
    await supabaseAdmin.from('families').delete().eq('id', familyId)
    console.error('family_members insert:', memberError)
    return NextResponse.json({ error: 'Mitgliedschaft konnte nicht angelegt werden.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, familyId, kuerzel })
}
