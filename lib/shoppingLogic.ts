import type { ShoppingItem, WeekPlanEntry, Rezept, Rezeptzutat, WochenSlot } from './state'
import { getMeal } from './mealsDataUtils'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const KATEGORIE_MAP: Record<string, string> = {
  frisch: 'Frische & Kühlregal',
  tiefkühl: 'Tiefkühl',
  speisekammer: 'Speisekammer',
  gefriertruhe: 'Gefriertruhe',
}

export const WARENGRUPPEN = [
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Milch & Käse',
  'Brot & Backwaren',
  'Tiefkühl',
  'Konserven',
  'Getränke',
  'Sonstiges',
] as const

export const NO_MERGE = '__NO_MERGE__'

const STOP_WORDS = new Set([
  'tk', 'tiefgekühlt', 'tiefgekühlte', 'tiefgekühlter', 'tiefgefroren', 'tiefgefrorene',
  'frisch', 'frische', 'frischer', 'bio', 'konventionell',
])

export function normalizeName(name: string): string {
  let n = name.toLowerCase().trim()
  // Remove parenthetical content: "(Dose)", "(TK)", "(bio)"
  n = n.replace(/\s*\([^)]+\)/g, '').trim()
  // Strip trailing color word lists: "rot, grün, gelb" / "rot/grün"
  n = n.replace(/[,\s]+(rot[e]?[rn]?|grün[e]?[rn]?|gelb[e]?[rn]?|orange[n]?|weiß[e]?[rn]?|lila|braun[e]?[rn]?|bunte?[rn]?)(\s*[,/]\s*(rot[e]?[rn]?|grün[e]?[rn]?|gelb[e]?[rn]?|orange[n]?|weiß[e]?[rn]?|lila|braun[e]?[rn]?|bunte?[rn]?))*/g, '').trim()
  // Strip leading color adjective: "rote Paprika" → "Paprika"
  n = n.replace(/^(rot[e]?[rn]?|grün[e]?[rn]?|gelb[e]?[rn]?|orange[n]?|weiß[e]?[rn]?|lila|braun[e]?[rn]?)\s+/, '').trim()
  // Strip trailing phrase modifiers
  n = n.replace(/\s+(im\s+netz|am\s+stück|am\s+stiel|in\s+scheiben|ohne\s+knochen)$/, '').trim()
  // Strip trailing stop words (one at a time from the end)
  const words = n.split(/\s+/)
  while (words.length > 1 && STOP_WORDS.has(words[words.length - 1])) words.pop()
  n = words.join(' ')
  // German plural: strip trailing 'n' from -en (Tomaten→Tomate) or -eln/-ern (Zwiebeln→Zwiebel)
  if (n.length > 5 && n.endsWith('en')) n = n.slice(0, -1)
  else if (n.length > 5 && (n.endsWith('eln') || n.endsWith('ern'))) n = n.slice(0, -1)
  return n.trim()
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function getDefaultWarengruppe(name: string, kategorie: string): string {
  const n = name.toLowerCase()
  if (kategorie === 'Tiefkühl') return 'Tiefkühl'
  if (/\b(tk|tiefgekühlt|tiefgefroren)\b/.test(n)) return 'Tiefkühl'
  if (/\b(hack|gulasch|schnitzel|steak|brust|schenkel|keule|speck|lachs|thunfisch|garnelen|fisch|forelle|krabben|meeresfrüchte|ente|hähnchen|huhn|pute|schwein|rind|lamm|kalb|wild|fleisch|wurst|filet|chorizo|salami|schinken|kabeljau|rotbarsch)\b/.test(n)) return 'Fleisch & Fisch'
  if (/\b(milch|joghurt|butter|käse|quark|sahne|creme|mozzarella|parmesan|ricotta|schmand|skyr|kefir|rahm|frischkäse|mascarpone)\b/.test(n)) return 'Milch & Käse'
  if (/\b(brot|brötchen|toast|mehl|hefe|backpulver|teig|tortilla|wrap|laugenbrezel|croissant|bagel|pita|ciabatta|semmel)\b/.test(n)) return 'Brot & Backwaren'
  if (/\b(konserve|tomatenpaste|tomatenmark)\b/.test(n) || (n.includes('dose') && !/tiefkühl/.test(n))) return 'Konserven'
  if (/\b(wasser|saft|limonade|cola|bier|wein|tee|kaffee|kakao|smoothie|nektar)\b/.test(n)) return 'Getränke'
  if (/\b(apfel|birne|banane|orange|zitrone|traube|beere|erdbeere|kirsche|pflaume|mango|ananas|avocado|papaya|melone|tomate|kartoffel|karotte|möhre|gurke|paprika|salat|spinat|brokkoli|blumenkohl|zucchini|aubergine|sellerie|lauch|zwiebel|knoblauch|petersilie|basilikum|kräuter|pilz|champignon|porree|kohlrabi|weißkohl|rotkohl|wirsing|fenchel|rucola|radieschen|spargel|pak\s+choi)\b/.test(n)) return 'Obst & Gemüse'
  return 'Sonstiges'
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
  nextWeek?: boolean
}

/**
 * Returns the day names from NEXT week that the last shopping day of the current week
 * must already cover (because the next shopping day falls after the week boundary).
 * Example: shoppingDays=['Samstag','Dienstag'] → ['Montag']
 */
export function computeNextWeekCoverage(shoppingDays: string[]): string[] {
  if (shoppingDays.length === 0) return []
  const dayIndex = (d: string) => WOCHENTAGE.indexOf(d)
  const valid = shoppingDays.filter(d => dayIndex(d) >= 0)
  if (valid.length === 0) return []
  // first shopping day of next week = lowest day index among all configured shopping days
  const firstNextShopIndex = Math.min(...valid.map(dayIndex))
  // next-week days BEFORE that first shopping day need to be bought in the current-week's last shop
  return WOCHENTAGE.slice(0, firstNextShopIndex)
}

export function isWaterIngredient(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === 'wasser' || n === 'leitungswasser' || n === 'salzwasser' ||
    n.startsWith('wasser ') || n.startsWith('wasser,')
}

function generateItemsForEntry(entry: WeekPlanEntry, mealsData: Record<string, Rezept>, nextWeek = false): ShoppingItem[] {
  if (entry.zutatenschonDa) return []
  const rezept = getMeal(mealsData, entry.tag, entry.slot, entry.gericht)
  if (!rezept) return []
  const bought = entry.zutatenSchonGekauft?.length
    ? new Set(entry.zutatenSchonGekauft.map(n => n.toLowerCase()))
    : null
  const items: ShoppingItem[] = []
  const seen = new Set<string>()
  for (const zutat of rezept.zutaten) {
    if (zutat.typ === 'grundvorrat') continue
    if (isWaterIngredient(zutat.name)) continue
    const key = zutat.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      id: randomId(),
      name: zutat.name,
      menge: zutat.menge,
      kategorie: KATEGORIE_MAP[zutat.typ] ?? 'Sonstiges',
      erledigt: bought?.has(key) ?? false,
      tag: entry.tag,
      slot: entry.slot,
      gericht: entry.gericht,
      ...(nextWeek ? { nextWeek: true } : {}),
      ...(zutat.fuer ? { fuer: zutat.fuer } : {}),
    })
  }
  // Neue Rezepte markieren allergiegerechte Zutaten mit `fuer` direkt in zutaten →
  // ersetzteZutaten nur für alte Rezepte als Fallback nutzen, sonst Duplikate.
  const hasFuerMarkierung = rezept.zutaten.some(z => z.fuer)
  if (!hasFuerMarkierung) {
    for (const ersatz of (rezept.ersetzteZutaten ?? [])) {
      const ersatzKey = ersatz.toLowerCase()
      items.push({
        id: randomId(),
        name: ersatz,
        menge: '',
        kategorie: 'Ersatz-Zutat',
        erledigt: bought?.has(ersatzKey) ?? false,
        tag: entry.tag,
        slot: entry.slot,
        gericht: entry.gericht,
        ...(nextWeek ? { nextWeek: true } : {}),
      })
    }
  }
  return items
}

export function generateShoppingList(
  weekPlan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
  selectedDays?: string[],
  nextWeekPlan?: WeekPlanEntry[],
  nextWeekMealsData?: Record<string, Rezept>,
  selectedNextWeekDays?: string[],
): ShoppingItem[] {
  const filtered = selectedDays
    ? weekPlan.filter(e => selectedDays.includes(e.tag))
    : weekPlan
  const items = filtered.flatMap(e => generateItemsForEntry(e, mealsData))

  if (nextWeekPlan && nextWeekMealsData && selectedNextWeekDays && selectedNextWeekDays.length > 0) {
    const nwFiltered = nextWeekPlan.filter(e => selectedNextWeekDays.includes(e.tag))
    items.push(...nwFiltered.flatMap(e => generateItemsForEntry(e, nextWeekMealsData, true)))
  }

  return items
}

export function groupShoppingByMeal(
  items: ShoppingItem[],
  weekPlan: WeekPlanEntry[],
  nextWeekPlan?: WeekPlanEntry[],
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
        i => !i.nextWeek && i.tag === day && i.slot === slot && i.gericht === entry.gericht,
      )
      if (groupItems.length === 0) continue
      seen.add(key)
      groups.push({ tag: day, slot, gericht: entry.gericht, emoji: entry.emoji, items: groupItems })
    }
  }

  if (nextWeekPlan) {
    for (const day of WOCHENTAGE) {
      for (const slot of ['Mittag', 'Abend'] as WochenSlot[]) {
        const entry = nextWeekPlan.find(e => e.tag === day && e.slot === slot)
        if (!entry) continue
        const key = `nw-${day}-${slot}-${entry.gericht}`
        if (seen.has(key)) continue
        const groupItems = items.filter(
          i => i.nextWeek && i.tag === day && i.slot === slot && i.gericht === entry.gericht,
        )
        if (groupItems.length === 0) continue
        seen.add(key)
        groups.push({ tag: day, slot, gericht: entry.gericht, emoji: entry.emoji, items: groupItems, nextWeek: true })
      }
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
  warengruppe: string
  erledigt: boolean
  ids: string[]
  sources: Array<{ tag: string; slot: WochenSlot; gericht: string }>
  variants?: Array<{
    name: string
    menge: string
    fuer?: string
    ids: string[]
    erledigt: boolean
  }>
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

export function consolidateShoppingList(
  items: ShoppingItem[],
  zutatenWarengruppe?: Record<string, string>,
  zutatenAliase?: Record<string, string>,
): ConsolidatedItem[] {
  const aliase = zutatenAliase ?? {}
  const warengruppe = zutatenWarengruppe ?? {}

  type Group = { items: ShoppingItem[]; canonicalName: string; wg: string }
  const map = new Map<string, Group>()

  for (const item of items) {
    const normalized = normalizeName(item.name)
    const alias = aliase[normalized]
    const isNoMerge = alias === NO_MERGE
    const key = isNoMerge
      ? `${item.name.toLowerCase()}::${item.fuer ?? ''}`
      : `${alias ?? normalized}::${item.fuer ?? ''}`

    if (!map.has(key)) {
      const canonicalName = isNoMerge
        ? item.name
        : alias ? capitalize(alias) : capitalize(normalized)
      const wg = warengruppe[normalized] ?? (alias && alias !== NO_MERGE ? warengruppe[alias] : undefined) ?? getDefaultWarengruppe(item.name, item.kategorie)
      map.set(key, { items: [], canonicalName, wg })
    }
    map.get(key)!.items.push(item)
  }

  return [...map.values()].map(({ items: group, canonicalName, wg }) => {
    // Collect distinct original names within the group for variant display
    const nameGroups = new Map<string, ShoppingItem[]>()
    for (const i of group) {
      const k = i.name.toLowerCase()
      if (!nameGroups.has(k)) nameGroups.set(k, [])
      nameGroups.get(k)!.push(i)
    }
    const variants: ConsolidatedItem['variants'] = nameGroups.size > 1
      ? [...nameGroups.values()].map(vItems => ({
          name: vItems[0].name,
          menge: mergeMenge(vItems.map(i => i.menge).filter(Boolean)),
          fuer: vItems[0].fuer,
          ids: vItems.map(i => i.id),
          erledigt: vItems.every(i => i.erledigt),
        }))
      : undefined

    return {
      name: canonicalName,
      menge: mergeMenge(group.map(i => i.menge).filter(Boolean)),
      kategorie: group[0].kategorie,
      warengruppe: wg,
      erledigt: group.every(i => i.erledigt),
      ids: group.map(i => i.id),
      sources: group
        .filter(i => i.tag && i.gericht)
        .map(i => ({ tag: i.tag!, slot: i.slot!, gericht: i.gericht! })),
      ...(variants ? { variants } : {}),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function rewriteShoppingItemsForDish(
  list: ShoppingItem[],
  entry: WeekPlanEntry,
  newRezept: Rezept,
  nextWeek = false,
): ShoppingItem[] {
  const preserved = list.filter(item =>
    item.gericht !== entry.gericht ||
    item.erledigt ||
    Boolean(item.nextWeek) !== nextWeek
  )
  const newItems = generateItemsForEntry(entry, { [entry.gericht]: newRezept }, nextWeek)
  return [...preserved, ...newItems]
}

export function rescaleShoppingListMengen(
  list: ShoppingItem[],
  gericht: string,
  newZutaten: Rezeptzutat[],
  nextWeek?: boolean,
): ShoppingItem[] {
  const mengenByName = new Map<string, string>()
  for (const z of newZutaten) {
    mengenByName.set(z.name.toLowerCase(), z.menge)
  }
  return list.map(item => {
    if (item.gericht !== gericht || item.erledigt) return item
    if (nextWeek !== undefined && Boolean(item.nextWeek) !== nextWeek) return item
    const newMenge = mengenByName.get(item.name.toLowerCase())
    if (newMenge === undefined) return item
    return { ...item, menge: newMenge }
  })
}

export function swapShoppingItemsTags(
  list: ShoppingItem[],
  tag1: string, slot1: WochenSlot, gericht1: string,
  tag2: string, slot2: WochenSlot, gericht2: string,
): ShoppingItem[] {
  return list.map(item => {
    if (item.erledigt) return item
    if (item.tag === tag1 && item.slot === slot1 && item.gericht === gericht1) {
      return { ...item, tag: tag2, slot: slot2, gericht: gericht2 }
    }
    if (item.tag === tag2 && item.slot === slot2 && item.gericht === gericht2) {
      return { ...item, tag: tag1, slot: slot1, gericht: gericht1 }
    }
    return item
  })
}

export function removeShoppingItemsForDish(
  list: ShoppingItem[],
  tag: string,
  slot: WochenSlot,
  gericht: string,
  nextWeek: boolean,
): { list: ShoppingItem[]; removedCount: number } {
  const toRemove = list.filter(
    item => !item.erledigt && item.tag === tag && item.slot === slot && item.gericht === gericht && Boolean(item.nextWeek) === nextWeek,
  )
  return { list: list.filter(item => !toRemove.includes(item)), removedCount: toRemove.length }
}

export function moveShoppingItemsForDish(
  list: ShoppingItem[],
  srcTag: string, srcSlot: WochenSlot, gericht: string, srcNextWeek: boolean,
  dstTag: string, dstSlot: WochenSlot, dstNextWeek: boolean,
): ShoppingItem[] {
  return list.map(item => {
    if (item.erledigt) return item
    if (item.tag === srcTag && item.slot === srcSlot && item.gericht === gericht && Boolean(item.nextWeek) === srcNextWeek) {
      const updated: ShoppingItem = { ...item, tag: dstTag, slot: dstSlot }
      if (dstNextWeek) updated.nextWeek = true
      else delete updated.nextWeek
      return updated
    }
    return item
  })
}

export function toggleConsolidatedItem(list: ShoppingItem[], ids: string[]): ShoppingItem[] {
  const idSet = new Set(ids)
  const allDone = ids.every(id => list.find(i => i.id === id)?.erledigt)
  return list.map(item => idSet.has(item.id) ? { ...item, erledigt: !allDone } : item)
}

export interface LadenGroupSection {
  warengruppe: string
  items: ConsolidatedItem[]
}

export interface LadenGroup {
  laden: string
  items: ConsolidatedItem[]
  sections: LadenGroupSection[]
  unassigned: boolean
}

function buildSections(items: ConsolidatedItem[]): LadenGroupSection[] {
  const byWg = new Map<string, ConsolidatedItem[]>(WARENGRUPPEN.map(wg => [wg, []]))
  for (const item of items) {
    const wg = byWg.has(item.warengruppe) ? item.warengruppe : 'Sonstiges'
    byWg.get(wg)!.push(item)
  }
  return WARENGRUPPEN
    .filter(wg => (byWg.get(wg)?.length ?? 0) > 0)
    .map(wg => ({ warengruppe: wg, items: byWg.get(wg)! }))
}

export function groupByLaden(
  items: ShoppingItem[],
  zutatenLaden: Record<string, string>,
  laeden: string[],
  zutatenWarengruppe?: Record<string, string>,
  zutatenAliase?: Record<string, string>,
): LadenGroup[] {
  const consolidated = consolidateShoppingList(items, zutatenWarengruppe, zutatenAliase)
  const byLaden = new Map<string, ConsolidatedItem[]>(laeden.map(l => [l, []]))
  const unassigned: ConsolidatedItem[] = []

  for (const item of consolidated) {
    // Look up by canonical name, then by each variant's original name (backward compat)
    const candidateKeys = [
      item.name.toLowerCase(),
      ...(item.variants?.map(v => v.name.toLowerCase()) ?? []),
    ]
    const laden = candidateKeys.map(k => zutatenLaden[k]).find(v => v !== undefined)
    if (laden && byLaden.has(laden)) {
      byLaden.get(laden)!.push(item)
    } else {
      unassigned.push(item)
    }
  }

  const result: LadenGroup[] = laeden
    .filter(l => (byLaden.get(l)?.length ?? 0) > 0)
    .map(l => {
      const groupItems = byLaden.get(l)!
      return { laden: l, items: groupItems, sections: buildSections(groupItems), unassigned: false }
    })

  if (unassigned.length > 0) {
    result.unshift({ laden: '__unassigned__', items: unassigned, sections: buildSections(unassigned), unassigned: true })
  }

  return result
}
