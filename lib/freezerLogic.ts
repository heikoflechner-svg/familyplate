import { supabase, FAMILY_ID } from './supabase'
import type { FreezerItem, PantryItem, Ampel, FreezerTyp } from './state'

// ── Gefriertruhe ──────────────────────────────────────────────────────────────

export async function loadFreezerItems(): Promise<FreezerItem[]> {
  const { data, error } = await supabase
    .from('freezer_items')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as FreezerItem[]
}

export async function addFreezerItem(item: {
  typ: FreezerTyp
  emoji: string
  name: string
  menge: string
  datum: string
  ampel: Ampel
}): Promise<FreezerItem | null> {
  const { data, error } = await supabase
    .from('freezer_items')
    .insert({ family_id: FAMILY_ID, ...item })
    .select()
    .single()

  if (error || !data) return null
  return data as FreezerItem
}

export async function updateFreezerItem(
  id: string,
  updates: Partial<Omit<FreezerItem, 'id'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('freezer_items')
    .update(updates)
    .eq('id', id)
    .eq('family_id', FAMILY_ID)

  return !error
}

export async function deleteFreezerItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('freezer_items')
    .delete()
    .eq('id', id)
    .eq('family_id', FAMILY_ID)

  return !error
}

// ── Speisekammer ──────────────────────────────────────────────────────────────

export async function loadPantryItems(): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as PantryItem[]
}

export async function addPantryItem(item: {
  emoji: string
  name: string
  menge: string
  ampel: Ampel
}): Promise<PantryItem | null> {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({ family_id: FAMILY_ID, ...item })
    .select()
    .single()

  if (error || !data) return null
  return data as PantryItem
}

export async function updatePantryItem(
  id: string,
  updates: Partial<Omit<PantryItem, 'id'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .update(updates)
    .eq('id', id)
    .eq('family_id', FAMILY_ID)

  return !error
}

export async function deletePantryItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .eq('id', id)
    .eq('family_id', FAMILY_ID)

  return !error
}

// ── Hilfsfunktionen für AI-Prompts ───────────────────────────────────────────

export function getFreezerListString(items: FreezerItem[]): string {
  if (!items.length) return 'leer'
  return items.map((i) => `${i.name} (${i.menge})`).join(', ')
}

export function getPantryListString(items: PantryItem[]): string {
  if (!items.length) return 'leer'
  return items
    .filter((i) => i.ampel !== 'red')
    .map((i) => `${i.name} (${i.menge})`)
    .join(', ')
}
