import { supabase, FAMILY_ID } from './supabase'
import type { WeekPlanEntry, Rezept, Wish, RemyVorschlag, WochenSlot, DayAttendance, Chef, ShoppingItem, ChangeProposal } from './state'

export async function loadWeekPlan(): Promise<{ plan: WeekPlanEntry[]; mealsData: Record<string, Rezept>; wishes: Wish[]; attendance: DayAttendance[]; shoppingList: ShoppingItem[]; proposals: ChangeProposal[]; wochenchef: Chef; planConfirmed: boolean; shopDone: boolean }> {
  const { data, error } = await supabase
    .from('week_plans')
    .select('plan_data, meals_data, wishes, attendance, shopping_list, proposals, wochenchef, plan_confirmed, shopping_done')
    .eq('family_id', FAMILY_ID)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return { plan: [], mealsData: {}, wishes: [], attendance: [], shoppingList: [], proposals: [], wochenchef: 'PA', planConfirmed: false, shopDone: false }
  return {
    plan: (data.plan_data as WeekPlanEntry[]) ?? [],
    mealsData: (data.meals_data as Record<string, Rezept>) ?? {},
    wishes: (data.wishes as Wish[]) ?? [],
    attendance: (data.attendance as DayAttendance[]) ?? [],
    shoppingList: (data.shopping_list as ShoppingItem[]) ?? [],
    proposals: (data.proposals as ChangeProposal[]) ?? [],
    wochenchef: ((data.wochenchef as Chef | null) ?? 'PA'),
    planConfirmed: (data.plan_confirmed as boolean | null) ?? false,
    shopDone: (data.shopping_done as boolean | null) ?? false,
  }
}

export async function saveShopDone(done: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', FAMILY_ID)
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_done: done }).eq('id', existing.id)
  }
}

export async function saveProposals(proposals: ChangeProposal[]): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', FAMILY_ID)
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ proposals }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: FAMILY_ID, plan_data: [], meals_data: {}, wishes: [], proposals })
  }
}

export async function saveWochenchef(chef: Chef): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', FAMILY_ID)
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ wochenchef: chef }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: FAMILY_ID, plan_data: [], meals_data: {}, wishes: [], wochenchef: chef })
  }
}

export async function savePlanConfirmed(confirmed: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', FAMILY_ID)
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
    .eq('family_id', FAMILY_ID)
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ shopping_list: shoppingList }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: FAMILY_ID, plan_data: [], meals_data: {}, wishes: [], attendance: [], shopping_list: shoppingList })
  }
}

export function getAttendanceForDay(attendance: DayAttendance[], tag: string, chefs: Chef[]): DayAttendance {
  return attendance.find(a => a.tag === tag) ?? { tag, anwesend: chefs, gaeste: 0 }
}

export async function saveAttendance(attendance: DayAttendance[]): Promise<void> {
  const { data: existing } = await supabase
    .from('week_plans')
    .select('id')
    .eq('family_id', FAMILY_ID)
    .limit(1)
    .single()

  if (existing?.id) {
    await supabase.from('week_plans').update({ attendance }).eq('id', existing.id)
  } else {
    await supabase.from('week_plans').insert({ family_id: FAMILY_ID, plan_data: [], meals_data: {}, wishes: [], attendance })
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
    .eq('family_id', FAMILY_ID)
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
      .insert({ family_id: FAMILY_ID, plan_data: plan, meals_data: mealsData, wishes })
  }
}

export async function generateWeekPlan(params: {
  planMittag: boolean
  planWE: boolean
  freezerList: string
  pantryList: string
  behaltene?: WeekPlanEntry[]
  neuTage?: string[]
  wishes?: Wish[]
  familyPrompt?: string
}): Promise<{ plan: WeekPlanEntry[]; mealsData: Record<string, Rezept> }> {
  const resp = await fetch('/api/week-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await resp.json()
  return {
    plan: (data.woche as WeekPlanEntry[]) ?? [],
    mealsData: (data.rezepte as Record<string, Rezept>) ?? {},
  }
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
): Promise<Rezept | null> {
  const resp = await fetch('/api/recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gericht, emoji, freezerList, pantryList, familyPrompt }),
  })
  const data = await resp.json()
  return (data.rezept as Rezept) ?? null
}
