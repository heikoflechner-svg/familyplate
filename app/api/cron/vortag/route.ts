import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminClient, initVapid,
  getDayNameBerlin, getDateBerlin,
  buildVortagPayloads, buildWochenchefPayloads, sendRemindersToFamily,
  type MemberBasic,
} from '../../../../lib/pushLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem, NextWeekData } from '../../../../lib/state'

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

  const targetDay = getDayNameBerlin(1)
  const targetDate = getDateBerlin(1)
  const todayName = getDayNameBerlin(0)
  const todayDate = getDateBerlin(0)
  const isSaOrSo = todayName === 'Samstag' || todayName === 'Sonntag'
  const isSunday = todayName === 'Sonntag'
  console.log(`[cron/vortag] Start – Ziel: ${targetDay} (${targetDate}), heute: ${todayName}`)

  const admin = getAdminClient()
  const { data: plans, error } = await admin
    .from('week_plans')
    .select('family_id, plan_data, meals_data, shopping_list, wochenchef, next_week_data')

  if (error || !plans) {
    console.error('[cron/vortag] DB-Fehler:', error)
    return NextResponse.json({ error: 'DB-Fehler beim Laden der Wochenpläne' }, { status: 500 })
  }

  let totalSent = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const row of plans) {
    const familyId = row.family_id as string
    const plan = (row.plan_data as WeekPlanEntry[]) ?? []
    const mealsData = (row.meals_data as Record<string, Rezept>) ?? {}
    const shoppingList = (row.shopping_list as ShoppingItem[]) ?? []
    const wochenchef = (row.wochenchef as string) ?? ''

    // Vortags-Erinnerung
    const payloads = buildVortagPayloads(plan, mealsData, shoppingList, wochenchef, targetDay, targetDate)
    if (payloads.length > 0) {
      const result = await sendRemindersToFamily(familyId, payloads, 'reminder_vortag')
      totalSent += result.sent
      totalSkipped += result.skipped
      errors.push(...result.errors)
    }

    // Wochenchef-Erinnerung (nur Sa/So)
    if (isSaOrSo) {
      const { data: memberRows } = await admin
        .from('family_members')
        .select('kuerzel, role, display_name')
        .eq('family_id', familyId)

      const members: MemberBasic[] = (memberRows ?? []).map(m => ({
        kuerzel: m.kuerzel as string,
        role: m.role as string,
        displayName: (m.display_name as string) || (m.kuerzel as string),
      }))

      const nextWeekData = (row.next_week_data as NextWeekData | null) ?? null
      const { payloads: wcPayloads, isAlreadyPlanned } = buildWochenchefPayloads({
        nextWeekData,
        currentWochenchef: wochenchef,
        members,
        targetDate: todayDate,
        isSunday,
      })

      if (isAlreadyPlanned) {
        console.log(`[cron/vortag] ${familyId}: nächste Woche bereits geplant, kein WC-Reminder`)
      } else if (wcPayloads.length > 0) {
        const result = await sendRemindersToFamily(familyId, wcPayloads, 'reminder_wochenchef')
        totalSent += result.sent
        totalSkipped += result.skipped
        errors.push(...result.errors)
      }
    }
  }

  console.log(`[cron/vortag] Fertig – gesendet: ${totalSent}, übersprungen: ${totalSkipped}`)
  return NextResponse.json({ ok: true, sent: totalSent, skipped: totalSkipped, errors })
}
