import { supabase, FAMILY_ID } from './supabase'
import type { WeekPlanEntry, Rezept, Wish, RemyVorschlag, WochenSlot } from './state'

export async function loadWeekPlan(): Promise<{ plan: WeekPlanEntry[]; mealsData: Record<string, Rezept> }> {
  const { data, error } = await supabase
    .from('week_plans')
    .select('plan_data, meals_data')
    .eq('family_id', FAMILY_ID)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return { plan: [], mealsData: {} }
  return {
    plan: (data.plan_data as WeekPlanEntry[]) ?? [],
    mealsData: (data.meals_data as Record<string, Rezept>) ?? {},
  }
}

export async function saveWeekPlan(
  plan: WeekPlanEntry[],
  mealsData: Record<string, Rezept>,
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
      .update({ plan_data: plan, meals_data: mealsData, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('week_plans')
      .insert({ family_id: FAMILY_ID, plan_data: plan, meals_data: mealsData })
  }
}

export async function generateWeekPlan(params: {
  planMittag: boolean
  planWE: boolean
  freezerList: string
  pantryList: string
  behaltene?: WeekPlanEntry[]
  neuTage?: string[]
}): Promise<WeekPlanEntry[]> {
  const resp = await fetch('/api/week-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await resp.json()
  return (data.woche as WeekPlanEntry[]) ?? []
}

export async function getRemySuggestions(params: {
  wishes: Wish[]
  zustimmungen: string[]
  choDay: string
  choSlot: WochenSlot | ''
  freezerList: string
  pantryList: string
}): Promise<RemyVorschlag[]> {
  const resp = await fetch('/api/remy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await resp.json()
  return (data.vorschlaege as RemyVorschlag[]) ?? []
}

export async function generateRecipe(
  gericht: string,
  emoji: string,
  freezerList: string,
  pantryList: string,
): Promise<Rezept | null> {
  const resp = await fetch('/api/recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gericht, emoji, freezerList, pantryList }),
  })
  const data = await resp.json()
  return (data.rezept as Rezept) ?? null
}
