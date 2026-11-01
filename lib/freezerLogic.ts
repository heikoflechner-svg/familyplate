import { supabase, getFamilyId } from './supabase'
import type { FreezerItem, PantryItem, Ampel, FreezerTyp } from './state'

// ── Gefriertruhe ──────────────────────────────────────────────────────────────

export async function loadFreezerItems(): Promise<FreezerItem[]> {
  const { data, error } = await supabase
    .from('freezer_items')
    .select('*')
    .eq('family_id', getFamilyId())
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
    .insert({ family_id: getFamilyId(), ...item })
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
    .eq('family_id', getFamilyId())

  return !error
}

export async function deleteFreezerItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('freezer_items')
    .delete()
    .eq('id', id)
    .eq('family_id', getFamilyId())

  return !error
}

// ── Speisekammer ──────────────────────────────────────────────────────────────

function mapPantryRow(row: Record<string, unknown>): PantryItem {
  return {
    id: row.id as string,
    emoji: row.emoji as string,
    name: row.name as string,
    menge: row.menge as string,
    ampel: row.ampel as Ampel,
    baldVerbrauchen: row.bald_verbrauchen === true || undefined,
    datum: row.datum as string | undefined,
  }
}

export async function loadPantryItems(): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('family_id', getFamilyId())
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(mapPantryRow)
}

export async function addPantryItem(item: {
  emoji: string
  name: string
  menge: string
  ampel: Ampel
  baldVerbrauchen?: boolean
  datum?: string
}): Promise<PantryItem | null> {
  const { baldVerbrauchen, datum, ...rest } = item
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({
      family_id: getFamilyId(),
      ...rest,
      ...(baldVerbrauchen ? { bald_verbrauchen: true } : {}),
      ...(datum !== undefined ? { datum } : {}),
    })
    .select()
    .single()

  if (error) {
    console.error('[addPantryItem] Fehler:', error.message)
    return null
  }
  if (!data) return null
  return mapPantryRow(data as Record<string, unknown>)
}

export async function updatePantryItem(
  id: string,
  updates: Partial<Omit<PantryItem, 'id'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .update(updates)
    .eq('id', id)
    .eq('family_id', getFamilyId())

  return !error
}

export async function deletePantryItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .eq('id', id)
    .eq('family_id', getFamilyId())

  return !error
}

// ── Hilfsfunktionen für AI-Prompts ───────────────────────────────────────────

export function getFreezerListString(items: FreezerItem[]): string {
  if (!items.length) return 'leer'
  return items.map((i) => {
    const flag = i.ampel === 'red' ? ' [DRINGEND – bald aufgebraucht]' : ''
    return `${i.name} (${i.menge})${flag}`
  }).join(', ')
}

export function getPantryListString(items: PantryItem[]): string {
  if (!items.length) return 'leer'
  return items.map((i) => {
    const flag = i.baldVerbrauchen ? ' [BALD VERBRAUCHEN]' : (i.ampel === 'red' ? ' [DRINGEND verwenden]' : '')
    return `${i.name} (${i.menge})${flag}`
  }).join(', ')
}
