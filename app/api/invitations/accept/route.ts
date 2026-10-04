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
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  let inviteToken: string, password: string | undefined
  try {
    const body = await req.json()
    inviteToken = (body.token ?? '').trim()
    password = body.password
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!inviteToken) {
    return NextResponse.json({ error: 'Einladungstoken fehlt.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  // Validate invite
  const { data: invite } = await supabaseAdmin
    .from('family_invitations')
    .select('id, family_id, email, target_kuerzel, invited_role, status, expires_at')
    .eq('token', inviteToken)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Ungültiger Einladungslink.' }, { status: 404 })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Diese Einladung wurde bereits verwendet oder zurückgezogen.' }, { status: 409 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    await supabaseAdmin.from('family_invitations').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'Diese Einladung ist abgelaufen. Bitte fordere eine neue an.' }, { status: 410 })
  }
  if (!invite.target_kuerzel) {
    return NextResponse.json({ error: 'Ungültige Einladung.' }, { status: 400 })
  }

  let userId: string

  if (bearerToken) {
    // Existing account flow
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Ungültige Session' }, { status: 401 })
    }

    // Email must match the invite
    if (user.email !== invite.email) {
      return NextResponse.json(
        { error: 'Diese Einladung gilt für eine andere E-Mail-Adresse.' },
        { status: 403 },
      )
    }

    // User must not already be in a family
    const { data: existingMember } = await supabaseAdmin
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json(
        { error: 'Dein Konto ist bereits einer Familie zugeordnet. Bitte wende dich an den Familiengründer.', code: 'ALREADY_IN_FAMILY' },
        { status: 409 },
      )
    }
    userId = user.id
  } else {
    // New account flow – invitation link proves email ownership
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 })
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })

    if (createError) {
      const msg = createError.message.toLowerCase()
      if (msg.includes('already') || msg.includes('registered')) {
        return NextResponse.json(
          { error: 'Diese E-Mail-Adresse hat bereits ein Konto. Bitte melde dich stattdessen an.' },
          { status: 409 },
        )
      }
      console.error('createUser error:', createError)
      return NextResponse.json({ error: 'Konto konnte nicht angelegt werden.' }, { status: 500 })
    }
    userId = created.user.id
  }

  // Resolve display name from family_profiles
  const { data: profileRow } = await supabaseAdmin
    .from('family_profiles')
    .select('members')
    .eq('family_id', invite.family_id)
    .maybeSingle()

  const members = (profileRow?.members ?? []) as Array<{ id: string; name: string }>
  const targetMember = members.find(m => m.id === invite.target_kuerzel)
  const displayName = targetMember?.name ?? invite.target_kuerzel

  // Link user to family
  const { error: memberError } = await supabaseAdmin
    .from('family_members')
    .insert({
      family_id: invite.family_id,
      user_id: userId,
      role: invite.invited_role ?? 'member',
      display_name: displayName,
      kuerzel: invite.target_kuerzel,
      email: invite.email,
    })

  if (memberError) {
    console.error('family_members insert:', memberError)
    return NextResponse.json({ error: 'Beitritt konnte nicht abgeschlossen werden.' }, { status: 500 })
  }

  // Mark invite as accepted
  await supabaseAdmin
    .from('family_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true, familyId: invite.family_id })
}
