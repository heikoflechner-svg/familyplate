import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, initVapid, sendPushToEndpoint } from '../../../../lib/pushLogic'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const admin = getAdminClient()

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  const { data: row } = await admin
    .from('family_members')
    .select('family_id, kuerzel')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })

  const familyId = row.family_id as string

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, family_id')
    .eq('user_id', user.id)
    .eq('family_id', familyId)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'Kein Abo auf diesem Konto gespeichert.' }, { status: 404 })
  }

  try {
    initVapid()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  let sent = 0
  for (const sub of subs as { endpoint: string; p256dh: string; auth: string; family_id: string }[]) {
    await sendPushToEndpoint(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: 'MenuFamPlan', body: 'Deine Push-Nachrichten funktionieren! 🎉', tag: 'test', url: '/' },
      sub.family_id,
    )
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
