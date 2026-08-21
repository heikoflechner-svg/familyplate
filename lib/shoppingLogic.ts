import type { ShoppingItem, WeekPlanEntry, Rezept } from './state'

const KATEGORIE_MAP: Record<string, string> = {
  frisch: 'Frische & Kühlregal',
  tiefkühl: 'Tiefkühl',
  speisekammer: 'Speisekammer',
  gefriertruhe: 'Gefriertruhe',
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function generateShoppingList(
  weekPlan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
): ShoppingItem[] {
  const seen = new Set<string>()
  const items: ShoppingItem[] = []

  for (const entry of weekPlan) {
    const rezept = mealsData[entry.gericht]
    if (!rezept) continue

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
      })
    }
  }

  return items.sort((a, b) => a.kategorie.localeCompare(b.kategorie))
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
