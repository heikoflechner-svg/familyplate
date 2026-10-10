import { supabase, getFamilyId } from './supabase'
import type { WeekPlanEntry, Rezept, Wish, RemyVorschlag, WochenSlot, DayAttendance, Chef, ShoppingItem, ChangeProposal, NextWeekData, NextWeekWish, PlanSettings, FamilyMember } from './state'

function toLocalDateIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getMondayIso(d: Date = new Date()): string {
  const date = new Date(d)
  const dow = date.getDay()
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow))
  return toLocalDateIso(date)
}

export function getNextMondayIso(d: Date = new Date()): string {
  const date = new Date(d)
  const dow = date.getDay()
  date.setDate(date.getDate() + (dow === 0 ? 1 : 8 - dow))
  return toLocalDateIso(date)
}

export async function loadWeekPlan(): Promise<{ plan: WeekPlanEntry[]; mealsData: Record<string, Rezept>; wishes: Wish[]; attendance: DayAttendance[]; attendanceConfirmed: Chef[]; shoppingList: ShoppingItem[]; proposals: ChangeProposal[]; wochenchef: Chef; planConfirmed: boolean; shopDone: boolean; shoppingDays: string[]; shoppingPersons: Record<string, Chef>; weekStart: string | null; planSettings: PlanSettings | null }> {
  const { data, error } = await supabase
    .from('week_plans')
    .select('plan_data, meals_data, wishes, attendance, shopping_list, proposals, wochenchef, plan_confirmed, shopping_done, shopping_day, shopping_persons, week_start, plan_settings')
    .eq('family_id', getFamilyId())
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return { plan: [], mealsData: {}, wishes: [], attendance: [], attendanceConfirmed: [], shoppingList: [], proposals: [], wochenchef: '', planConfirmed: false, shopDone: false, shoppingDays: [], shoppingPersons: {}, weekStart: null, planSettings: null }

  const rawAttendance = data.attendance
  let attendance: DayAttendance[] = []
  let attendanceConfirmed: Chef[] = []
  if (Array.isArray(rawAttendance)) {
    attendance = rawAttendance as DayAttendance[]
  } else if (rawAttendance && typeof rawAttendance === 'object') {
    const raw = rawAttendance as Record<string, unknown>
    attendance = (raw.days as DayAttendance[]) ?? []
    attendanceConfirmed = (raw.confirmed as Chef[]) ?? []
  }

  return {
    plan: Array.isArray(data.plan_data) ? (data.plan_data as WeekPlanEntry[]) : [],
    mealsData: (data.meals_data as Record<string, Rezept>) ?? {},
    wishes: Array.isArray(data.wishes) ? (data.wishes as Wish[]) : [],
    attendance,
    attendanceConfirmed,
    shoppingList: Array.isArray(data.shopping_list) ? (data.shopping_list as ShoppingItem[]) : [],
    proposals: Array.isArray(data.proposals) ? (data.proposals as ChangeProposal[]) : [],
    wochenchef: ((data.wochenchef as Chef | null) ?? ''),
    planConfirmed: (data.plan_confirmed as boolean | null) ?? false,
    shopDone: (data.shopping_done as boolean | null) ?? false,
    shoppingDays: ((data.shopping_day as string | null) ?? '').split(',').filter(Boolean),
    shoppingPersons: (data.shopping_persons as Record<string, Chef> | null) ?? {},
    weekStart: (data.week_start as string | null) ?? null,
    planSettings: (data.plan_settings as PlanSettings | null) ?? null,
  }
}

export async function saveShoppingPersons(persons: Record<string, Chef>): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  const value = Object.keys(persons).length > 0 ? persons : null
  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_persons: value }).eq('id', existing.id)
  }
}

export async function saveWeekStart(weekStart: string): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()
  if (existing?.id) {
    await supabase.from('week_plans').update({ week_start: weekStart }).eq('id', existing.id)
  }
}

export async function loadNextWeekData(): Promise<{ nextWeekStart: string | null; nextWeekData: NextWeekData | null }> {
  const { data, error } = await supabase
    .from('week_plans')
    .select('next_week_start, next_week_data')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()
  if (error || !data) return { nextWeekStart: null, nextWeekData: null }
  return {
    nextWeekStart: (data.next_week_start as string | null) ?? null,
    nextWeekData: (data.next_week_data as NextWeekData | null) ?? null,
  }
}

export async function saveNextWeekData(weekStart: string, data: NextWeekData): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()
  if (existing?.id) {
    await supabase.from('week_plans')
      .update({ next_week_start: weekStart, next_week_data: data })
      .eq('id', existing.id)
  }
}

export async function activateNextWeek(): Promise<{ weekStart: string | null; nextWeekData: NextWeekData | null }> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id, next_week_start, next_week_data')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (!existing?.id) return { weekStart: null, nextWeekData: null }

  const nextStart = existing.next_week_start as string | null
  const nextData = existing.next_week_data as NextWeekData | null

  const { error: updateError } = await supabase.from('week_plans').update({
    week_start: nextStart ?? getMondayIso(),
    wochenchef: nextData?.wochenchef ?? '',
    plan_data: nextData?.plan ?? [],
    meals_data: nextData?.mealsData ?? {},
    wishes: (nextData?.wishes ?? []) as unknown as NextWeekWish[],
    proposals: [],
    attendance: nextData?.attendance
      ? { v: 2, days: nextData.attendance, confirmed: nextData.attendanceConfirmed ?? [] }
      : [],
    plan_confirmed: false,
    shopping_list: [],
    shopping_done: false,
    shopping_day: null,
    shopping_persons: null,
    plan_settings: nextData?.planSettings ?? null,
    next_week_start: null,
    next_week_data: null,
    updated_at: new Date().toISOString(),
  }).eq('id', existing.id)

  if (updateError) throw new Error(`activateNextWeek fehlgeschlagen: ${updateError.message}`)

  return { weekStart: nextStart, nextWeekData: nextData }
}

export async function saveShopDone(done: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_done: done }).eq('id', existing.id)
  }
}

export async function saveShoppingDays(days: string[]): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  const value = days.length > 0 ? days.join(',') : null
  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_day: value }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: getFamilyId(), plan_data: [], meals_data: {}, wishes: [], shopping_day: value })
  }
}

export async function saveProposals(proposals: ChangeProposal[]): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ proposals }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: getFamilyId(), plan_data: [], meals_data: {}, wishes: [], proposals })
  }
}

export async function saveWochenchef(chef: Chef): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ wochenchef: chef }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: getFamilyId(), plan_data: [], meals_data: {}, wishes: [], wochenchef: chef })
  }
}

export async function savePlanConfirmed(confirmed: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ plan_confirmed: confirmed }).eq('id', existing.id)
  }
}

export async function saveShoppingList(shoppingList: ShoppingItem[]): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_list: shoppingList }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: getFamilyId(), plan_data: [], meals_data: {}, wishes: [], attendance: [], shopping_list: shoppingList })
  }
}

export function getAttendanceForDay(attendance: DayAttendance[], tag: string, chefs: Chef[]): DayAttendance {
  const found = attendance.find(a => a.tag === tag)
  if (!found) return { tag, mittagAnwesend: chefs, abendAnwesend: chefs, gaeste: 0 }
  if (!found.mittagAnwesend) {
    const legacy = (found as unknown as { anwesend?: Chef[] }).anwesend ?? chefs
    return { tag, mittagAnwesend: legacy, abendAnwesend: legacy, gaeste: found.gaeste ?? 0 }
  }
  return found
}

export function getPersonCountForSlot(
  tag: string,
  slot: WochenSlot,
  attendance: DayAttendance[],
  members: FamilyMember[],
): number {
  const allChefs = members.map(m => m.id as Chef)
  const day = getAttendanceForDay(attendance, tag, allChefs)
  const anwesend = slot === 'Mittag' ? day.mittagAnwesend : day.abendAnwesend
  return anwesend.length + (day.gaeste ?? 0)
}

export async function saveAttendance(days: DayAttendance[], confirmed: Chef[]): Promise<void> {
  const payload = { v: 2, days, confirmed }
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ attendance: payload }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: getFamilyId(), plan_data: [], meals_data: {}, wishes: [], attendance: payload })
  }
}

export async function saveWeekPlan(
  plan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
  wishes: Wish[],
): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', getFamilyId())
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase
      .from('week_plans')
      .update({ plan_data: plan, meals_data: mealsData, wishes, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('week_plans')
      .insert({ family_id: getFamilyId(), plan_data: plan, meals_data: mealsData, wishes })
  }
}

export async function loadLastDishes(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('week_plans')
      .select('last_dishes')
      .eq('family_id', getFamilyId())
      .limit(1)
      .single()
    if (error || !data) return []
    return (data.last_dishes as string[] | null) ?? []
  } catch {
    return []
  }
}

export async function saveLastDishes(dishes: string[]): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('week_plans')
      .select('id')
      .eq('family_id', getFamilyId())
      .limit(1)
      .single()
    if (existing?.id) {
      await supabase.from('week_plans').update({ last_dishes: dishes }).eq('id', existing.id)
    }
  } catch {
    // History ist nice-to-have – Fehler still ignorieren
  }
}

export async function generateWeekPlan(params: {
  mittagsloseTage: string[]
  planWE: boolean
  freezerList: string
  pantryList: string
  behaltene?: WeekPlanEntry[]
  neuTage?: string[]
  wishes?: Wish[]
  familyPrompt?: string
  lastDishes?: string[]
  gaesteProTag?: { tag: string; gaeste: number }[]
  memberIds?: string[]
}): Promise<{ plan: WeekPlanEntry[]; mealsData: Record<string, Rezept> }> {
  const resp = await fetch('/api/week-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await resp.json()
  const plan = (data.woche as WeekPlanEntry[]) ?? []
  const allergie = (data.allergie as Record<string, string[]>) ?? {}
  // Die Wochenplanung liefert nur noch Gerichtnamen + Allergie-Ersatz (schnell, Sonnet).
  // Daraus bauen wir Rezept-Stubs; volle Zutaten/Schritte werden lazy nachgeladen
  // (beim Antippen eines Gerichts oder beim Erstellen der Einkaufsliste).
  //
  // WICHTIG: Bei Einzel-/Tages-Rerolls enthält `plan` auch die unveränderten
  // `behaltene`-Gerichte, aber `allergie` deckt nur die NEU geplanten Slots ab.
  // Wir dürfen daher nur Stubs für die neu geplanten Slots erzeugen – sonst würden
  // die Stubs beim Merge in den Aufrufern die bestehenden Rezepte + Allergie-Infos
  // aller behaltenen Gerichte überschreiben (Allergie-Warnungen gingen verloren).
  const behalteneKeys = new Set((params.behaltene ?? []).map(e => `${e.tag}-${e.slot}`))
  const mealsData: Record<string, Rezept> = {}
  for (const e of plan) {
    if (behalteneKeys.has(`${e.tag}-${e.slot}`)) continue
    if (mealsData[e.gericht]) continue
    mealsData[e.gericht] = {
      name: e.gericht,
      emoji: e.emoji,
      zutaten: [],
      schritte: [],
      minuten: e.minuten ?? 0,
      schwierigkeit: '',
      ersetzteZutaten: allergie[e.gericht] ?? [],
    }
  }
  return { plan, mealsData }
}

// Ein "volles" Rezept hat Zubereitungsschritte und mehr als 4 Zutaten oder mindestens
// eine Grundvorrat-Zutat. Stubs aus der schnellen Wochenplanung (0 Schritte) und
// alte Kurz-Rezepte (≤4 Zutaten, kein 'grundvorrat') werden als unvollständig
// behandelt und beim nächsten Antippen/Neu-Klick automatisch neu geladen.
export function isFullRecipe(r?: Rezept | null): boolean {
  if (!r || r.schritte.length === 0) return false
  return r.zutaten.length > 4 || r.zutaten.some(z => z.typ === 'grundvorrat')
}

export async function getRemySuggestions(params: {
  wishes: Wish[]
  zustimmungen: string[]
  choDay: string
  choSlot: WochenSlot | ''
  freezerList: string
  pantryList: string
  familyPrompt?: string
}): Promise<RemyVorschlag[]> {
  const resp = await fetch('/api/remy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      wishes: params.wishes.map(w =>
        w.type === 'ergaenzung'
          ? { person: w.person, tag: w.tag, slot: w.slot, type: 'ergaenzung', text: w.text }
          : { person: w.person, tag: w.tag, slot: w.slot, type: 'alternative', dishName: w.dishName, emoji: w.emoji }
      ),
    }),
  })
  const data = await resp.json()
  return (data.vorschlaege as RemyVorschlag[]) ?? []
}

export async function generateRecipe(
  gericht: string,
  emoji: string,
  freezerList: string,
  pantryList: string,
  familyPrompt?: string,
  personCount?: number,
): Promise<Rezept | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gericht, emoji, freezerList, pantryList, familyPrompt, personCount }),
      })
      if (!resp.ok) {
        if (attempt === 0) continue
        return null
      }
      const data = await resp.json()
      const rezept = (data.rezept as Rezept) ?? null
      if (rezept) return rezept
      if (attempt === 0) continue
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

// Returns null on failure so callers skip saving — old personenAnzahl is preserved → retry on next open.
export async function rescaleRecipe(existing: Rezept, newPersonCount: number): Promise<Rezept | null> {
  const oldPersonCount = existing.personenAnzahl ?? 4
  if (oldPersonCount === newPersonCount) return { ...existing, personenAnzahl: newPersonCount }
  try {
    const resp = await fetch('/api/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'rescale',
        existingZutaten: existing.zutaten.map(z => ({ menge: z.menge, name: z.name, typ: z.typ })),
        oldPersonCount,
        newPersonCount,
      }),
    })
    if (!resp.ok) throw new Error('HTTP error')
    const data = await resp.json()
    const zutaten = data.zutaten as Rezept['zutaten']
    if (!Array.isArray(zutaten) || zutaten.length === 0) throw new Error('No zutaten')
    // API returns only {menge,name,typ} — re-apply fuer from existing by name match
    const zutatenMitFuer = zutaten.map(z => {
      const orig = existing.zutaten.find(e => e.name.toLowerCase() === z.name.toLowerCase())
      return orig?.fuer ? { ...z, fuer: orig.fuer } : z
    })
    return { ...existing, zutaten: zutatenMitFuer, personenAnzahl: newPersonCount }
  } catch {
    return null
  }
}

export async function loadMissingRecipes(
  entries: WeekPlanEntry[],
  store: Record<string, Rezept>,
  freezerList: string,
  pantryList: string,
  familyPrompt: string,
  getPersonCount?: (tag: string, slot: WochenSlot) => number,
): Promise<Record<string, Rezept>> {
  const result: Record<string, Rezept> = { ...store }
  const seen = new Set<string>()
  const missing = entries.filter(e => {
    if (seen.has(e.gericht) || isFullRecipe(result[e.gericht])) return false
    seen.add(e.gericht)
    return true
  })
  await Promise.all(missing.map(async e => {
    const personCount = getPersonCount ? getPersonCount(e.tag, e.slot) : undefined
    const r = await generateRecipe(e.gericht, e.emoji, freezerList, pantryList, familyPrompt, personCount)
    if (r) {
      result[e.gericht] = {
        ...r,
        personenAnzahl: personCount,
        ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []),
      }
    }
  }))
  return result
}
