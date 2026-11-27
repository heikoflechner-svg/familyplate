import type { WeekPlanEntry, Rezept, WochenSlot } from './state'

export function mealsKey(tag: string, slot: WochenSlot | string): string {
  return `${tag}-${slot}`
}

// Hier definiert (statt in mealLogic) um Zirkularimport zu vermeiden.
// mealLogic importiert migrateMealsDataAddSlotKeys von hier, daher darf mealsDataUtils
// nichts aus mealLogic importieren.
export function isFullRecipe(r?: Rezept | null): boolean {
  if (!r || r.schritte.length === 0) return false
  if (r.name === 'Hähnchen-Pasta' && r.schritte[0]?.startsWith('Hähnchen auftauen')) return false
  return r.zutaten.length > 4 || r.zutaten.some(z => z.typ === 'grundvorrat')
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

/** Gibt true zurück wenn irgendein Slot-Key fehlt (und sein Name-Key ein volles Rezept hat)
 *  ODER wenn ein Slot-Key ein Stub für dieses Gericht ist und der Name-Key voll ist. */
export function needsMigration(plan: WeekPlanEntry[], meals: Record<string, Rezept>): boolean {
  return plan.some(e => {
    const slotK = mealsKey(e.tag, e.slot)
    const nameRecipe = meals[e.gericht]
    const slotRecipe = meals[slotK]
    if (!nameRecipe || !isFullRecipe(nameRecipe)) return false
    if (!slotRecipe) return true
    return slotRecipe.schritte.length === 0 &&
      (!slotRecipe.fuerGericht || slotRecipe.fuerGericht === e.gericht)
  })
}

/** Kopiert volle Name-Key-Rezepte in Slot-Keys und repariert Stubs.
 *  Regeln:
 *  – Slot fehlt + Name-Key ist voll  → Slot-Key anlegen (mit fuerGericht)
 *  – Slot fehlt + Name-Key ist Stub  → NICHTS (keine Stubs in Slot-Keys erzeugen)
 *  – Slot ist Stub für dieses Gericht + Name-Key ist voll → Slot-Key ersetzen
 *  – Slot hat volles Rezept           → unverändert
 *  Gibt das Original-Objekt zurück wenn keine Änderungen nötig (Referenz-Gleichheit). */
export function migrateMealsDataAddSlotKeys(
  plan: WeekPlanEntry[],
  meals: Record<string, Rezept>
): Record<string, Rezept> {
  let result: Record<string, Rezept> | null = null
  for (const entry of plan) {
    const slotK = mealsKey(entry.tag, entry.slot)
    const src = result ?? meals
    const nameRecipe = src[entry.gericht]
    const slotRecipe = src[slotK]
    if (!nameRecipe || !isFullRecipe(nameRecipe)) continue

    const slotMissing = !slotRecipe
    const slotIsStub = slotRecipe
      ? slotRecipe.schritte.length === 0 && (!slotRecipe.fuerGericht || slotRecipe.fuerGericht === entry.gericht)
      : false

    if (slotMissing || slotIsStub) {
      if (!result) result = { ...meals }
      result[slotK] = { ...nameRecipe, fuerGericht: entry.gericht }
    }
  }
  return result ?? meals
}
