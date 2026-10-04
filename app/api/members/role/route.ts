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

  let targetKuerzel: string, newRole: string
  try {
    const body = await req.json()
    targetKuerzel = ((body.targetKuerzel as string) ?? '').trim().toUpperCase()
    newRole = ((body.newRole as string) ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  if (!targetKuerzel || !newRole) {
    return NextResponse.json({ error: 'targetKuerzel und newRole sind Pflicht.' }, { status: 400 })
  }
  if (!(['member', 'parent', 'admin'] as string[]).includes(newRole)) {
    return NextResponse.json({ error: 'Ungültige Rolle. Erlaubt: member, parent, admin.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  // Caller must be owner or admin
  const { data: callerMember } = await supabaseAdmin
    .from('family_members')
    .select('family_id, role, kuerzel')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (!callerMember) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
  }

  // Cannot change own role
  if ((callerMember as { kuerzel: string }).kuerzel === targetKuerzel) {
    return NextResponse.json({ error: 'Eigene Rolle kann nicht geändert werden.' }, { status: 403 })
  }

  // Target must be in the same family
  const { data: targetMember } = await supabaseAdmin
    .from('family_members')
    .select('id, role')
    .eq('kuerzel', targetKuerzel)
    .eq('family_id', (callerMember as { family_id: string }).family_id)
    .maybeSingle()

  if (!targetMember) {
    return NextResponse.json({ error: 'Mitglied nicht gefunden.' }, { status: 404 })
  }

  // Owner role is immutable
  if ((targetMember as { role: string }).role === 'owner') {
    return NextResponse.json({ error: 'Die Gründer-Rolle kann nicht geändert werden.' }, { status: 403 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('family_members')
    .update({ role: newRole })
    .eq('id', (targetMember as { id: string }).id)

  if (updateError) {
    console.error('members/role:', updateError)
    return NextResponse.json({ error: 'Rollenänderung fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
