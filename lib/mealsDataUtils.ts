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
  const slotRecipe = mealsData[`${tag}-${slot}`]
  if (slotRecipe && gerName) {
    if (slotRecipe.fuerGericht !== undefined) {
      if (slotRecipe.fuerGericht === gerName) {
        // Slot ist Stub (0 Schritte) aber Name-Key hat volles Rezept → Name-Key zurückgeben
        if (slotRecipe.schritte.length === 0) {
          const nameRecipe = mealsData[gerName]
          if (nameRecipe && nameRecipe.schritte.length > 0) return nameRecipe
        }
        return slotRecipe
      }
      return mealsData[gerName]
    }
    // fuerGericht absent (old entry): tolerant check — nur wenn der Slot-Rezept-Name den
    // Gericht-Namen enthält (Rémy-Elaboration, z.B. "Pasta" → "Pasta mit Lachs").
    // Umkehrrichtung (b.includes(a)) absichtlich entfernt: zu viele False-Positives
    // (z.B. "Eintopf aufgewärmt".includes("Eintopf") würde falsches Rezept zurückgeben).
    const a = slotRecipe.name.toLowerCase()
    const b = gerName.toLowerCase()
    if (a.includes(b)) return slotRecipe
    return mealsData[gerName]
  }
  return slotRecipe ?? (gerName ? mealsData[gerName] : undefined)
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
      result[slotK] = { ...result[entry.gericht], fuerGericht: entry.gericht }
    }
  }
  return result
}
