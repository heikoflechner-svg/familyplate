import { supabase, getFamilyId } from './supabase'
import type { Chef } from './state'

export interface DishRating {
  id: string
  gerName: string
  member: Chef
  sterne: number
  datum: string
}

export async function loadDishRatings(): Promise<DishRating[]> {
  const familyId = getFamilyId()
  if (!familyId) return []
  const { data, error } = await supabase
    .from('dish_ratings')
    .select('id, gericht_name, member, sterne, datum')
    .eq('family_id', familyId)
  if (error || !data) return []
  return (data as Array<{ id: string; gericht_name: string; member: string; sterne: number; datum: string }>)
    .map(r => ({ id: r.id, gerName: r.gericht_name, member: r.member as Chef, sterne: r.sterne, datum: r.datum }))
}

export async function saveDishRating(
  gerName: string,
  member: Chef,
  sterne: number,
): Promise<DishRating | null> {
  const familyId = getFamilyId()
  if (!familyId) return null
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('dish_ratings')
    .upsert(
      { family_id: familyId, gericht_name: gerName, member, sterne, datum: today },
      { onConflict: 'family_id,gericht_name,member' },
    )
    .select('id, gericht_name, member, sterne, datum')
    .single()
  if (error || !data) return null
  const row = data as { id: string; gericht_name: string; member: string; sterne: number; datum: string }
  return { id: row.id, gerName: row.gericht_name, member: row.member as Chef, sterne: row.sterne, datum: row.datum }
}

export function computeRatingAvg(ratings: DishRating[], gerName: string): { sum: number; count: number; avg: number } | null {
  const relevant = ratings.filter(r => r.gerName.toLowerCase() === gerName.toLowerCase())
  if (!relevant.length) return null
  const sum = relevant.reduce((acc, r) => acc + r.sterne, 0)
  return { sum, count: relevant.length, avg: sum / relevant.length }
}

export function fmtAvg(avg: number, count: number): string {
  return `⭐ ${avg.toFixed(1).replace('.', ',')} (${count})`
}
