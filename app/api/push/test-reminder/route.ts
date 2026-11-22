import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminClient, initVapid,
  getDayNameBerlin, getDateBerlin,
  buildVortagPayloads, buildKochtagPayloads, buildWochenchefPayloads,
  getSubscriptionsForMember, sendPushToEndpoint,
  type MemberBasic, type NotificationPayload,
} from '../../../../lib/pushLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem, NextWeekData } from '../../../../lib/state'

export const maxDuration = 30

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

  const { data: memberRow } = await admin
    .from('family_members')
    .select('family_id, kuerzel, role, display_name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!memberRow) return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })
  if (memberRow.role !== 'owner') {
    return NextResponse.json({ error: 'Nur Organisatoren können Test-Erinnerungen senden.' }, { status: 403 })
  }

  const familyId = memberRow.family_id as string
  const testerMemberId = memberRow.kuerzel as string

  const body = await req.json() as { type?: string }
  const type = body.type
  if (type !== 'vortag' && type !== 'kochtag' && type !== 'wochenchef') {
    return NextResponse.json({ error: 'Ungültiger Typ. Erwartet: vortag, kochtag oder wochenchef.' }, { status: 400 })
  }

  const { data: planRow } = await admin
    .from('week_plans')
    .select('plan_data, meals_data, shopping_list, wochenchef, next_week_data')
    .eq('family_id', familyId)
    .maybeSingle()

  if (!planRow) {
    return NextResponse.json({ ok: true, sent: 0, msg: 'Kein Wochenplan für diese Familie gefunden.' })
  }

  const wochenchef = (planRow.wochenchef as string) ?? ''

  // ── Wochenchef-Test ──────────────────────────────────────────────────────────
  if (type === 'wochenchef') {
    const nextWeekData = (planRow.next_week_data as NextWeekData | null) ?? null
    const isPlanned = nextWeekData?.planConfirmed === true && !nextWeekData?.isDraft
    if (isPlanned) {
      return NextResponse.json({ ok: true, sent: 0, msg: 'Nächste Woche ist bereits geplant – keine Erinnerung nötig.' })
    }

    const { data: memberRows } = await admin
      .from('family_members')
      .select('kuerzel, role, display_name')
      .eq('family_id', familyId)
    const members: MemberBasic[] = (memberRows ?? []).map(m => ({
      kuerzel: m.kuerzel as string,
      role: m.role as string,
      displayName: (m.display_name as string) || (m.kuerzel as string),
    }))
    const nameMap = Object.fromEntries(members.map(m => [m.kuerzel, m.displayName]))
    const todayDate = getDateBerlin(0)

    // Beide Varianten bauen (unabhängig vom aktuellen Wochentag)
    const { payloads: satPayloads } = buildWochenchefPayloads({
      nextWeekData, currentWochenchef: wochenchef, members, targetDate: todayDate, isSunday: false,
    })
    const { payloads: sunPayloads } = buildWochenchefPayloads({
      nextWeekData, currentWochenchef: wochenchef, members, targetDate: todayDate, isSunday: true,
    })
    const allPayloads: NotificationPayload[] = [...satPayloads, ...sunPayloads]

    if (allPayloads.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, msg: 'Keine Ziel-Empfänger ermittelbar (keine Mitglieder mit Owner/Admin-Rolle?).' })
    }

    const testerSubs = await getSubscriptionsForMember(familyId, testerMemberId)
    if (testerSubs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, msg: 'Kein Push-Abo für dieses Gerät gefunden. Erst Push einschalten.' })
    }

    try { initVapid() } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }

    let sent = 0
    for (const payload of allPayloads) {
      const targetName = nameMap[payload.memberId] || payload.memberId
      const testBody = `Test – ginge an: ${targetName}\n${payload.body}`.trim()
      for (const sub of testerSubs) {
        await sendPushToEndpoint(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: payload.title, body: testBody.slice(0, 240), tag: `test-${payload.tag}-${Date.now()}`, url: '/' },
          familyId,
        )
      }
      sent++
    }
    return NextResponse.json({ ok: true, sent })
  }

  // ── Vortag / Kochtag-Test ───────────────────────────────────────────────────
  const plan = (planRow.plan_data as WeekPlanEntry[]) ?? []
  const mealsData = (planRow.meals_data as Record<string, Rezept>) ?? {}
  const shoppingList = (planRow.shopping_list as ShoppingItem[]) ?? []

  const offset = type === 'vortag' ? 1 : 0
  const targetDay = getDayNameBerlin(offset)
  const targetDate = getDateBerlin(offset)

  const payloads = type === 'vortag'
    ? buildVortagPayloads(plan, mealsData, shoppingList, wochenchef, targetDay, targetDate)
    : buildKochtagPayloads(plan, mealsData, wochenchef, targetDay, targetDate)

  if (payloads.length === 0) {
    const label = type === 'vortag' ? `morgen (${targetDay})` : `heute (${targetDay})`
    return NextResponse.json({ ok: true, sent: 0, msg: `Für ${label} ist kein Gericht mit Koch geplant.` })
  }

  const { data: allMembers } = await admin
    .from('family_members')
    .select('kuerzel, display_name')
    .eq('family_id', familyId)
  const nameMap = Object.fromEntries(
    (allMembers ?? []).map(m => [m.kuerzel as string, (m.display_name as string) || (m.kuerzel as string)])
  )

  const testerSubs = await getSubscriptionsForMember(familyId, testerMemberId)
  if (testerSubs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, msg: 'Kein Push-Abo für dieses Gerät gefunden. Erst Push einschalten.' })
  }

  try { initVapid() } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  let sent = 0
  for (const payload of payloads) {
    const targetName = nameMap[payload.memberId] || payload.memberId
    const testBody = `Test – ginge an: ${targetName}\n${payload.body}`.trim()
    for (const sub of testerSubs) {
      await sendPushToEndpoint(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { title: payload.title, body: testBody.slice(0, 240), tag: `test-${payload.tag}-${Date.now()}`, url: '/' },
        familyId,
      )
    }
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
