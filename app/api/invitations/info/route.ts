import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token fehlt.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: invite } = await supabaseAdmin
    .from('family_invitations')
    .select('family_id, email, target_kuerzel, status, expires_at, invited_role')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Ungültiger Einladungslink.' }, { status: 404 })
  }
  if (invite.status === 'accepted') {
    return NextResponse.json({ error: 'Diese Einladung wurde bereits angenommen.' }, { status: 409 })
  }
  if (invite.status === 'revoked') {
    return NextResponse.json({ error: 'Diese Einladung wurde zurückgezogen.' }, { status: 410 })
  }
  if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
    if (invite.status === 'pending') {
      await supabaseAdmin
        .from('family_invitations')
        .update({ status: 'expired' })
        .eq('token', token)
    }
    return NextResponse.json({ error: 'Diese Einladung ist abgelaufen. Bitte fordere eine neue an.' }, { status: 410 })
  }

  const [{ data: family }, { data: profile }] = await Promise.all([
    supabaseAdmin.from('families').select('name').eq('id', invite.family_id).maybeSingle(),
    supabaseAdmin.from('family_profiles').select('members').eq('family_id', invite.family_id).maybeSingle(),
  ])

  const members = (profile?.members ?? []) as Array<{ id: string; name: string }>
  const member = members.find(m => m.id === invite.target_kuerzel)

  return NextResponse.json({
    familyName: family?.name ?? 'Deine Familie',
    personName: member?.name ?? invite.target_kuerzel,
    email: invite.email,
    expiresAt: invite.expires_at,
    invitedRole: (invite.invited_role ?? 'member') as string,
  })
}
