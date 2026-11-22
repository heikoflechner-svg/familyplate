import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '../../../../lib/pushLogic'

async function getCallerInfo(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: row } = await admin
    .from('family_members')
    .select('family_id, kuerzel')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return null
  return { userId: user.id, familyId: row.family_id as string, memberId: row.kuerzel as string }
}

// POST: Abo speichern (upsert bei geteiltem Gerät)
export async function POST(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })

  const body = await req.json() as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }
  const sub = body.subscription
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Ungültige Subscription.' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_id: caller.userId,
      family_id: caller.familyId,
      member_id: caller.memberId,
      last_used: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('[push/subscribe] upsert error:', error)
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE: Abo dieses Geräts löschen
export async function DELETE(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })

  const body = await req.json() as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ error: 'Kein endpoint.' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', caller.userId)

  if (error) {
    console.error('[push/subscribe] delete error:', error)
    return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
