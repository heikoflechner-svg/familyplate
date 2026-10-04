import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

function roleLabelForEmail(role: string): string {
  if (role === 'admin') return 'Eltern'
  if (role === 'parent') return 'Oma, Opa & Co.'
  return 'Mitglied'
}

function roleHintForEmail(role: string): string {
  if (role === 'admin') return 'Verwalten die Familie mit: alle Profile, Einladungen, Rollen und Einstellungen.'
  if (role === 'parent') return 'Z. B. Großeltern, Au-pair: eigenes Profil und die Profile der Kinder.'
  return 'Bearbeitet nur das eigene Profil.'
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const DAILY_LIMIT = 5

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  let email: string, targetKuerzel: string, invitedRole: string
  try {
    const body = await req.json()
    email = (body.email ?? '').trim().toLowerCase()
    targetKuerzel = (body.targetKuerzel ?? '').trim().toUpperCase()
    invitedRole = body.invitedRole ?? 'member'
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!email || !targetKuerzel) {
    return NextResponse.json({ error: 'E-Mail und Kürzel sind Pflicht.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 400 })
  }
  if (!['member', 'parent', 'admin'].includes(invitedRole)) {
    return NextResponse.json({ error: 'Ungültige Rolle.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session' }, { status: 401 })
  }

  // Caller must be owner or admin
  const { data: ownerRow } = await supabaseAdmin
    .from('family_members')
    .select('family_id, display_name')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (!ownerRow) {
    return NextResponse.json({ error: 'Nur Gründer oder Mitverwaltung können einladen.' }, { status: 403 })
  }

  const familyId = ownerRow.family_id

  // Kürzel must exist in family_profiles
  const { data: profileRow } = await supabaseAdmin
    .from('family_profiles')
    .select('members')
    .eq('family_id', familyId)
    .maybeSingle()

  const members = (profileRow?.members ?? []) as Array<{ id: string; name: string }>
  const targetMember = members.find(m => m.id === targetKuerzel)
  if (!targetMember) {
    return NextResponse.json({ error: 'Kürzel nicht in der Familie gefunden.' }, { status: 404 })
  }

  // Kürzel must not already be linked to a user account
  const { data: existingLink } = await supabaseAdmin
    .from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('kuerzel', targetKuerzel)
    .maybeSingle()

  if (existingLink) {
    return NextResponse.json({ error: `${targetMember.name} hat bereits ein Konto.` }, { status: 409 })
  }

  // No active pending invite for this kürzel
  const { data: existingInvite } = await supabaseAdmin
    .from('family_invitations')
    .select('id')
    .eq('family_id', familyId)
    .eq('target_kuerzel', targetKuerzel)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: 'Es gibt bereits eine offene Einladung für diese Person.' }, { status: 409 })
  }

  // Rate limit: max DAILY_LIMIT invitations per family per 24 h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('family_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .gte('created_at', since)

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Maximal ${DAILY_LIMIT} Einladungen pro Tag möglich.` },
      { status: 429 },
    )
  }

  const { data: familyRow } = await supabaseAdmin
    .from('families')
    .select('name')
    .eq('id', familyId)
    .maybeSingle()

  // Create the invitation record
  const { data: invitation, error: insertError } = await supabaseAdmin
    .from('family_invitations')
    .insert({
      family_id: familyId,
      email,
      invited_by: user.id,
      target_kuerzel: targetKuerzel,
      invited_role: invitedRole,
    })
    .select('token')
    .single()

  if (insertError || !invitation) {
    console.error('invitation insert:', insertError)
    return NextResponse.json({ error: 'Einladung konnte nicht gespeichert werden.' }, { status: 500 })
  }

  const host = req.headers.get('host') ?? 'menufamplan.de'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
  const inviteUrl = `${appUrl}/einladung?token=${invitation.token}`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: emailError } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'MenuFamPlan <onboarding@resend.dev>',
    to: email,
    subject: `${ownerRow.display_name} lädt dich zu MenuFamPlan ein`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="text-align:center;font-size:42px;margin-bottom:16px;">🍽</div>
        <h1 style="text-align:center;font-size:20px;color:#111;font-weight:700;margin-bottom:8px;">Du wurdest eingeladen</h1>
        <p style="color:#444;line-height:1.6;margin-bottom:24px;">
          Hallo ${targetMember.name},<br>
          <strong>${ownerRow.display_name}</strong> hat dich zur Familie
          <strong>${familyRow?.name ?? 'deiner Familie'}</strong> auf MenuFamPlan eingeladen.<br>
          <span style="font-size:13px;">Deine Rolle: <strong>${roleLabelForEmail(invitedRole)}</strong> – ${roleHintForEmail(invitedRole)}</span>
        </p>
        <div style="text-align:center;margin-bottom:32px;">
          <a href="${inviteUrl}"
             style="display:inline-block;background:#1D9E75;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
            Einladung annehmen
          </a>
        </div>
        <p style="color:#bbb;font-size:12px;text-align:center;">
          Die Einladung ist 7 Tage gültig. Falls du diese Mail nicht erwartet hast, kannst du sie einfach ignorieren.
        </p>
      </div>
    `,
  })

  if (emailError) {
    await supabaseAdmin.from('family_invitations').delete().eq('token', invitation.token)
    console.error('Resend error:', emailError)
    return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
