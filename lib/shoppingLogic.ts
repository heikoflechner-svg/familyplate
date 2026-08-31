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

    for (const ersatz of (rezept.ersetzteZutaten ?? [])) {
      items.push({
        id: randomId(),
        name: ersatz,
        menge: '',
        kategorie: 'Ersatz-Zutat',
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

export interface ConsolidatedItem {
  name: string
  menge: string
  kategorie: string
  erledigt: boolean
  ids: string[]
  sources: Array<{ tag: string; slot: WochenSlot; gericht: string }>
}

function mergeMenge(mengen: string[]): string {
  if (mengen.length === 0) return ''
  if (mengen.length === 1) return mengen[0]

  type Parsed = { amount: number; unit: string }
  const parsed: (Parsed | null)[] = mengen.map(m => {
    const match = m.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
    if (!match) return null
    return { amount: parseFloat(match[1].replace(',', '.')), unit: match[2].trim() }
  })

  const allParsed = parsed.every(Boolean) as boolean
  if (allParsed) {
    const units = new Set((parsed as Parsed[]).map(p => p.unit))
    if (units.size === 1) {
      const total = (parsed as Parsed[]).reduce((s, p) => s + p.amount, 0)
      const unit = [...units][0]
      const totalStr = Number.isInteger(total) ? String(total) : total.toFixed(1).replace('.', ',')
      return unit ? `${totalStr} ${unit}` : totalStr
    }
  }

  return mengen.join(' + ')
}

export function consolidateShoppingList(items: ShoppingItem[]): ConsolidatedItem[] {
  const map = new Map<string, { items: ShoppingItem[] }>()

  for (const item of items) {
    const key = item.name.toLowerCase()
    if (!map.has(key)) map.set(key, { items: [] })
    map.get(key)!.items.push(item)
  }

  return [...map.values()].map(({ items: group }) => {
    const first = group[0]
    return {
      name: first.name,
      menge: mergeMenge(group.map(i => i.menge).filter(Boolean)),
      kategorie: first.kategorie,
      erledigt: group.every(i => i.erledigt),
      ids: group.map(i => i.id),
      sources: group
        .filter(i => i.tag && i.gericht)
        .map(i => ({ tag: i.tag!, slot: i.slot!, gericht: i.gericht! })),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function toggleConsolidatedItem(list: ShoppingItem[], ids: string[]): ShoppingItem[] {
  const idSet = new Set(ids)
  const allDone = ids.every(id => list.find(i => i.id === id)?.erledigt)
  return list.map(item => idSet.has(item.id) ? { ...item, erledigt: !allDone } : item)
}
