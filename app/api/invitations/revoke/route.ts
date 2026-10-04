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
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  let inviteId: string
  try {
    const body = await req.json()
    inviteId = (body.inviteId ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!inviteId) {
    return NextResponse.json({ error: 'inviteId fehlt.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session' }, { status: 401 })
  }

  // Caller must be owner or admin of the family that owns this invite
  const { data: callerMember } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (!callerMember) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
  }

  // Invite must belong to the same family
  const { data: invite } = await supabaseAdmin
    .from('family_invitations')
    .select('id, status')
    .eq('id', inviteId)
    .eq('family_id', callerMember.family_id)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Einladung nicht gefunden.' }, { status: 404 })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Nur ausstehende Einladungen können zurückgezogen werden.' }, { status: 409 })
  }

  await supabaseAdmin
    .from('family_invitations')
    .update({ status: 'revoked' })
    .eq('id', inviteId)

  return NextResponse.json({ success: true })
}
