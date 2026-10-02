import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  let name: string, email: string, password: string, captchaToken: string
  try {
    const body = await req.json()
    name = body.name?.trim() ?? ''
    email = body.email?.trim().toLowerCase() ?? ''
    password = body.password ?? ''
    captchaToken = body.captchaToken ?? ''
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!name || !email || !password || !captchaToken) {
    return NextResponse.json({ error: 'Alle Felder sind Pflicht.' }, { status: 400 })
  }

  // hCaptcha validieren
  const captchaBody = new URLSearchParams({
    secret: process.env.HCAPTCHA_SECRET_KEY!,
    response: captchaToken,
  })
  const captchaRes = await fetch('https://api.hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: captchaBody.toString(),
  })
  const captchaData = await captchaRes.json() as { success: boolean; 'error-codes'?: string[] }
  if (!captchaData.success) {
    console.error('[hCaptcha] siteverify failed. error-codes:', captchaData['error-codes'] ?? '(none)')
    return NextResponse.json({ error: 'Captcha ungültig. Bitte erneut versuchen.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  // Nutzer anlegen + Bestätigungslink generieren in einem Admin-API-Aufruf.
  // Admin-API sendet KEINE automatische Mail – wir senden exakt eine via Resend.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      data: { display_name: name },
      redirectTo: process.env.NEXT_PUBLIC_APP_URL,
    },
  })

  if (linkError) {
    const msg = linkError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered')) {
      return NextResponse.json({ error: 'Diese E-Mail ist bereits registriert.' }, { status: 409 })
    }
    console.error('generateLink error:', linkError)
    return NextResponse.json({ error: 'Registrierung fehlgeschlagen.' }, { status: 500 })
  }

  if (!linkData.properties?.action_link) {
    return NextResponse.json({ error: 'Bestätigungslink konnte nicht erstellt werden.' }, { status: 500 })
  }

  const confirmUrl = linkData.properties.action_link

  // Einzige Bestätigungsmail via Resend
  const { error: emailError } = await resend.emails.send({
    from: 'MenuFamPlan <onboarding@resend.dev>',
    to: email,
    subject: 'Konto bestätigen – MenuFamPlan',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="text-align:center;font-size:42px;margin-bottom:16px;">🍽</div>
        <h1 style="text-align:center;font-size:20px;color:#111;font-weight:700;margin-bottom:8px;">Willkommen bei MenuFamPlan</h1>
        <p style="color:#444;line-height:1.6;margin-bottom:24px;">Hallo ${name},<br>bitte bestätige deine E-Mail-Adresse, damit dein Konto aktiviert wird.</p>
        <div style="text-align:center;margin-bottom:32px;">
          <a href="${confirmUrl}" style="display:inline-block;background:#1D9E75;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">E-Mail bestätigen</a>
        </div>
        <p style="color:#bbb;font-size:12px;text-align:center;">Der Link ist 24 Stunden gültig. Falls du dich nicht registriert hast, kannst du diese Mail ignorieren.</p>
      </div>
    `,
  })

  if (emailError) {
    console.error('Resend error:', emailError)
    return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
