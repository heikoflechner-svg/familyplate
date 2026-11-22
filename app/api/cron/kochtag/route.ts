import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminClient, initVapid,
  getDayNameBerlin, getDateBerlin,
  buildKochtagPayloads, sendRemindersToFamily,
} from '../../../../lib/pushLogic'
import type { WeekPlanEntry, Rezept } from '../../../../lib/state'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    initVapid()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const targetDay = getDayNameBerlin(0)
  const targetDate = getDateBerlin(0)
  console.log(`[cron/kochtag] Start – Ziel: ${targetDay} (${targetDate})`)

  const admin = getAdminClient()
  const { data: plans, error } = await admin
    .from('week_plans')
    .select('family_id, plan_data, meals_data, wochenchef')

  if (error || !plans) {
    console.error('[cron/kochtag] DB-Fehler:', error)
    return NextResponse.json({ error: 'DB-Fehler beim Laden der Wochenpläne' }, { status: 500 })
  }

  let totalSent = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const row of plans) {
    const familyId = row.family_id as string
    const plan = (row.plan_data as WeekPlanEntry[]) ?? []
    const mealsData = (row.meals_data as Record<string, Rezept>) ?? {}
    const wochenchef = (row.wochenchef as string) ?? ''

    const payloads = buildKochtagPayloads(plan, mealsData, wochenchef, targetDay, targetDate)
    if (payloads.length === 0) continue

    const result = await sendRemindersToFamily(familyId, payloads, 'reminder_kochtag')
    totalSent += result.sent
    totalSkipped += result.skipped
    errors.push(...result.errors)
  }

  console.log(`[cron/kochtag] Fertig – gesendet: ${totalSent}, übersprungen: ${totalSkipped}`)
  return NextResponse.json({ ok: true, sent: totalSent, skipped: totalSkipped, errors })
}
