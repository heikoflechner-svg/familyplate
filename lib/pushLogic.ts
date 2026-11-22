import { setVapidDetails, sendNotification } from 'web-push'
import { createClient } from '@supabase/supabase-js'

export interface PushSubscriptionRow {
  id: string
  family_id: string
  user_id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function initVapid() {
  const subject = process.env.VAPID_SUBJECT
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !pubKey || !privKey) {
    throw new Error('Push-Konfiguration unvollständig (VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY oder VAPID_PRIVATE_KEY fehlen).')
  }
  setVapidDetails(subject, pubKey, privKey)
}

export async function sendPushToEndpoint(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag?: string; url?: string },
  familyId: string,
): Promise<void> {
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    )
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string }
    console.error('[push] sendNotification failed:', e?.statusCode, e?.message, sub.endpoint.slice(0, 60))
    if (e?.statusCode === 410) {
      const admin = getAdminClient()
      await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('family_id', familyId)
      console.log('[push] Abgelaufenes Abo entfernt:', sub.endpoint.slice(0, 60))
    }
  }
}

export async function getSubscriptionsForMember(
  familyId: string,
  memberId: string,
): Promise<PushSubscriptionRow[]> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, family_id, user_id, member_id, endpoint, p256dh, auth')
    .eq('family_id', familyId)
    .eq('member_id', memberId)
  if (error || !data) return []
  return data as PushSubscriptionRow[]
}
