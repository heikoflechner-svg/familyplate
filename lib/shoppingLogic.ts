import type { ShoppingItem, WeekPlanEntry, Rezept, WochenSlot } from './state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const KATEGORIE_MAP: Record<string, string> = {
  frisch: 'Frische & Kühlregal',
  tiefkühl: 'Tiefkühl',
  speisekammer: 'Speisekammer',
  gefriertruhe: 'Gefriertruhe',
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export interface ShoppingGroup {
  tag: string
  slot: WochenSlot
  gericht: string
  emoji: string
  items: ShoppingItem[]
}

export function generateShoppingList(
  weekPlan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
  selectedDays?: string[],
): ShoppingItem[] {
  const items: ShoppingItem[] = []
  const filtered = selectedDays
    ? weekPlan.filter(e => selectedDays.includes(e.tag))
    : weekPlan

  for (const entry of filtered) {
    const rezept = mealsData[entry.gericht]
    if (!rezept) continue

    const seen = new Set<string>()
    for (const zutat of rezept.zutaten) {
      const key = zutat.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      items.push({
        id: randomId(),
        name: zutat.name,
        menge: zutat.menge,
        kategorie: KATEGORIE_MAP[zutat.typ] ?? 'Sonstiges',
        erledigt: false,
        tag: entry.tag,
        slot: entry.slot,
        gericht: entry.gericht,
      })
    }
  }

  return items
}

export function groupShoppingByMeal(
  items: ShoppingItem[],
  weekPlan: WeekPlanEntry[],
): ShoppingGroup[] {
  const groups: ShoppingGroup[] = []
  const seen = new Set<string>()

  for (const day of WOCHENTAGE) {
    for (const slot of ['Mittag', 'Abend'] as WochenSlot[]) {
      const entry = weekPlan.find(e => e.tag === day && e.slot === slot)
      if (!entry) continue
      const key = `${day}-${slot}-${entry.gericht}`
      if (seen.has(key)) continue
      const groupItems = items.filter(
        i => i.tag === day && i.slot === slot && i.gericht === entry.gericht,
      )
      if (groupItems.length === 0) continue
      seen.add(key)
      groups.push({ tag: day, slot, gericht: entry.gericht, emoji: entry.emoji, items: groupItems })
    }
  }

  return groups
}

export function addShoppingItem(
  list: ShoppingItem[],
  name: string,
  menge: string,
  kategorie = 'Sonstiges',
): ShoppingItem[] {
  const item: ShoppingItem = { id: randomId(), name, menge, kategorie, erledigt: false }
  return [...list, item]
}

export function toggleShoppingItem(list: ShoppingItem[], id: string): ShoppingItem[] {
  return list.map((item) => (item.id === id ? { ...item, erledigt: !item.erledigt } : item))
}

export function removeShoppingItem(list: ShoppingItem[], id: string): ShoppingItem[] {
  return list.filter((item) => item.id !== id)
}

export function clearCompleted(list: ShoppingItem[]): ShoppingItem[] {
  return list.filter((item) => !item.erledigt)
}

export function groupByKategorie(list: ShoppingItem[]): Record<string, ShoppingItem[]> {
  return list.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
    if (!acc[item.kategorie]) acc[item.kategorie] = []
    acc[item.kategorie].push(item)
    return acc
  }, {})
}
