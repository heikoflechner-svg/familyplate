import type { WeekPlanEntry, Rezept, WochenSlot } from './state'

export function mealsKey(tag: string, slot: WochenSlot | string): string {
  return `${tag}-${slot}`
}

export function getMeal(
  mealsData: Record<string, Rezept>,
  tag: string,
  slot: WochenSlot | string,
  gerName?: string
): Rezept | undefined {
  return mealsData[`${tag}-${slot}`] ?? (gerName ? mealsData[gerName] : undefined)
}

export function needsMigration(plan: WeekPlanEntry[], meals: Record<string, Rezept>): boolean {
  return plan.some(e => !!meals[e.gericht] && !meals[mealsKey(e.tag, e.slot)])
}

export function migrateMealsDataAddSlotKeys(
  plan: WeekPlanEntry[],
  meals: Record<string, Rezept>
): Record<string, Rezept> {
  const result: Record<string, Rezept> = { ...meals }
  for (const entry of plan) {
    const slotK = mealsKey(entry.tag, entry.slot)
    if (!result[slotK] && result[entry.gericht]) {
      result[slotK] = result[entry.gericht]
    }
  }
  return result
}
