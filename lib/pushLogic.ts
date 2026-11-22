import { setVapidDetails, sendNotification } from 'web-push'
import { createClient } from '@supabase/supabase-js'
import type { WeekPlanEntry, Rezept, ShoppingItem } from './state'

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
    if (e?.statusCode === 410 || e?.statusCode === 404) {
      const admin = getAdminClient()
      await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('family_id', familyId)
      console.log('[push] Abgelaufenes/ungültiges Abo entfernt:', sub.endpoint.slice(0, 60))
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

// ── Reminder-Logik ─────────────────────────────────────────────────────────────

export interface NotificationPayload {
  memberId: string
  title: string
  body: string
  tag: string
  url: string
}

function truncate(str: string, maxLen: number): string {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

/** Tagesname in Europe/Berlin für heute (+0) oder morgen (+1). */
export function getDayNameBerlin(offsetDays = 0): string {
  const berlinToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
  const [y, m, d] = berlinToday.split('-').map(Number)
  const targetUtc = new Date(Date.UTC(y, m - 1, d + offsetDays))
  const name = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long' }).format(targetUtc)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** ISO-Datum (YYYY-MM-DD) in Europe/Berlin für heute (+0) oder morgen (+1). */
export function getDateBerlin(offsetDays = 0): string {
  const berlinToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
  const [y, m, d] = berlinToday.split('-').map(Number)
  const targetUtc = new Date(Date.UTC(y, m - 1, d + offsetDays))
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(targetUtc)
}

const PREP_KEYWORDS = ['einweichen', 'marinieren', 'auftauen', 'über nacht', 'kühlstellen']

function findPrepKeywords(rezept: Rezept | undefined): string[] {
  if (!rezept?.schritte?.length) return []
  const found: string[] = []
  for (const schritt of rezept.schritte) {
    const lower = schritt.toLowerCase()
    for (const kw of PREP_KEYWORDS) {
      if (lower.includes(kw) && !found.includes(kw)) found.push(kw)
    }
  }
  return found
}

function getRezept(mealsData: Record<string, Rezept>, entry: WeekPlanEntry): Rezept | undefined {
  return mealsData[`${entry.slot}-${entry.tag}`] || mealsData[entry.gericht]
}

function groupByChef(
  plan: WeekPlanEntry[],
  targetDay: string,
  wochenchef: string,
): Map<string, WeekPlanEntry[]> {
  const byChef = new Map<string, WeekPlanEntry[]>()
  for (const entry of plan) {
    if (entry.tag !== targetDay || !entry.gericht) continue
    const chef = entry.chef || wochenchef
    if (!chef) continue
    if (!byChef.has(chef)) byChef.set(chef, [])
    byChef.get(chef)!.push(entry)
  }
  return byChef
}

/** Payloads für die Vortags-Erinnerung (eine pro Koch). */
export function buildVortagPayloads(
  plan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
  shoppingList: ShoppingItem[],
  wochenchef: string,
  targetDay: string,
  targetDate: string,
): NotificationPayload[] {
  const byChef = groupByChef(plan, targetDay, wochenchef)
  const payloads: NotificationPayload[] = []

  for (const [chef, entries] of byChef) {
    const gerichte = entries.map(e => `${e.emoji ?? ''} ${e.gericht}`.trim())
    const title = truncate(`Morgen kochst du: ${gerichte.join(' + ')}`, 65)

    const bodyParts: string[] = []

    // Noch einkaufen
    const todoNames: string[] = []
    for (const entry of entries) {
      const items = shoppingList.filter(
        i => !i.erledigt && !i.nextWeek &&
          (i.gericht === entry.gericht || (i.tag === entry.tag && i.slot === entry.slot)),
      )
      for (const i of items.slice(0, 3)) {
        if (!todoNames.includes(i.name)) todoNames.push(i.name)
      }
    }
    if (todoNames.length > 0) bodyParts.push(`Kaufen: ${todoNames.slice(0, 3).join(', ')}`)

    // Aus der Gefriertruhe
    const gefrier = entries.filter(e => e.quelle === 'gefriertruhe').map(e => e.gericht)
    if (gefrier.length > 0) bodyParts.push(`Gefriertruhe: ${gefrier.join(', ')}`)

    // Vorbereitung
    const prepKws = new Set<string>()
    for (const entry of entries) findPrepKeywords(getRezept(mealsData, entry)).forEach(kw => prepKws.add(kw))
    if (prepKws.size > 0) bodyParts.push(`Vorbereitung: ${[...prepKws].join(', ')}`)

    payloads.push({
      memberId: chef,
      title,
      body: truncate(bodyParts.join(' · '), 200),
      tag: `vortag-${chef}-${targetDate}`,
      url: '/?tab=woche',
    })
  }
  return payloads
}

/** Payloads für die Kochtag-Erinnerung (eine pro Koch). */
export function buildKochtagPayloads(
  plan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
  wochenchef: string,
  targetDay: string,
  targetDate: string,
): NotificationPayload[] {
  const byChef = groupByChef(plan, targetDay, wochenchef)
  const payloads: NotificationPayload[] = []

  for (const [chef, entries] of byChef) {
    const slotLabels = entries.map(e => {
      const slot = e.slot === 'Mittag' ? 'Mittag' : 'Abend'
      const mins = e.minuten ? `, ${e.minuten} Min` : ''
      return `${e.emoji ?? ''} ${e.gericht} (${slot}${mins})`.trim()
    })
    const title = truncate(`Heute kochst du: ${entries.map(e => e.gericht).join(' + ')}`, 65)

    const bodyParts: string[] = []
    if (slotLabels.length > 1) bodyParts.push(slotLabels.join(' + '))
    else if (slotLabels.length === 1) bodyParts.push(slotLabels[0])

    const gefrier = entries.filter(e => e.quelle === 'gefriertruhe').map(e => e.gericht)
    if (gefrier.length > 0) bodyParts.push(`Schon aufgetaut? (${gefrier.join(', ')})`)

    payloads.push({
      memberId: chef,
      title,
      body: truncate(bodyParts.join(' · '), 200),
      tag: `kochtag-${chef}-${targetDate}`,
      url: '/?tab=woche',
    })
  }
  return payloads
}

export interface WochenchefPayloadsResult {
  payloads: NotificationPayload[]
  isAlreadyPlanned: boolean
}

export interface MemberBasic {
  kuerzel: string
  role: string
  displayName: string
}

/** Payloads für die Wochenchef-Erinnerung (Samstag → NW-Chef, Sonntag → Owner+Admin). */
export function buildWochenchefPayloads(params: {
  nextWeekData: { wochenchef?: string; planConfirmed?: boolean; isDraft?: boolean } | null
  currentWochenchef: string
  members: MemberBasic[]
  targetDate: string
  isSunday: boolean
}): WochenchefPayloadsResult {
  const { nextWeekData, currentWochenchef, members, targetDate, isSunday } = params

  const isPlanned = nextWeekData?.planConfirmed === true && !nextWeekData?.isDraft
  if (isPlanned) return { payloads: [], isAlreadyPlanned: true }

  const nextChef = (nextWeekData?.wochenchef || currentWochenchef) || ''
  const payloads: NotificationPayload[] = []

  if (!isSunday) {
    // Samstag: an den NW-Wochenchef, Fallback: alle Owner
    const chefMember = nextChef ? members.find(m => m.kuerzel === nextChef) : undefined
    const targets = chefMember ? [chefMember] : members.filter(m => m.role === 'owner')
    for (const t of targets) {
      payloads.push({
        memberId: t.kuerzel,
        title: 'Du bist nächste Woche Wochenchef 👨‍🍳',
        body: 'Die Woche ist noch nicht geplant – jetzt mit Rémy planen?',
        tag: `wochenchef-sa-${t.kuerzel}-${targetDate}`,
        url: '/?tab=woche',
      })
    }
  } else {
    // Sonntag: an alle Owner + Admin
    const chefDisplayName = nextChef
      ? (members.find(m => m.kuerzel === nextChef)?.displayName || nextChef)
      : 'Der Wochenchef'
    const targets = members.filter(m => m.role === 'owner' || m.role === 'admin')
    for (const t of targets) {
      payloads.push({
        memberId: t.kuerzel,
        title: 'Nächste Woche ist noch nicht geplant',
        body: truncate(`${chefDisplayName} hat noch nicht geplant – übernehmen?`, 200),
        tag: `wochenchef-so-${t.kuerzel}-${targetDate}`,
        url: '/?tab=woche',
      })
    }
  }

  return { payloads, isAlreadyPlanned: false }
}

/** Sendet Payloads an die Geräte der jeweiligen Köche. Prüft push_settings. */
export async function sendRemindersToFamily(
  familyId: string,
  payloads: NotificationPayload[],
  reminderKey: 'reminder_vortag' | 'reminder_kochtag' | 'reminder_wochenchef',
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const admin = getAdminClient()
  const result = { sent: 0, skipped: 0, errors: [] as string[] }

  for (const payload of payloads) {
    // user_id für dieses member ermitteln
    const { data: memberRow } = await admin
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .eq('kuerzel', payload.memberId)
      .maybeSingle()

    if (!memberRow?.user_id) {
      console.log(`[push/remind] ${familyId}/${payload.memberId}: kein verknüpftes Konto, übersprungen`)
      result.skipped++
      continue
    }

    // Push-Einstellung prüfen
    const { data: settings } = await admin
      .from('push_settings')
      .select(reminderKey)
      .eq('user_id', memberRow.user_id)
      .maybeSingle()

    if (settings && (settings as Record<string, boolean>)[reminderKey] === false) {
      console.log(`[push/remind] ${familyId}/${payload.memberId}: ${reminderKey} deaktiviert, übersprungen`)
      result.skipped++
      continue
    }

    const subs = await getSubscriptionsForMember(familyId, payload.memberId)
    if (subs.length === 0) {
      console.log(`[push/remind] ${familyId}/${payload.memberId}: keine Abos, übersprungen`)
      result.skipped++
      continue
    }

    for (const sub of subs) {
      await sendPushToEndpoint(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { title: payload.title, body: payload.body, tag: payload.tag, url: payload.url },
        familyId,
      )
    }
    result.sent++
  }

  return result
}
