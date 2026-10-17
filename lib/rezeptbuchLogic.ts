import { supabase, getFamilyId } from './supabase'
import type { Rezept, Chef, RezeptbuchEntry, RezeptbewertungEintrag } from './state'

function rowToEntry(row: Record<string, unknown>): RezeptbuchEntry {
  return {
    id: row.id as string,
    rezept: row.rezept as Rezept,
    kategorie: (row.kategorie as string | null) ?? null,
    isFavorit: (row.is_favorit as boolean) ?? false,
    sterneSumme: Number(row.sterne_summe ?? 0),
    anzahlStimmen: (row.anzahl_stimmen as number) ?? 0,
    bewertungen: (row.bewertungen as RezeptbewertungEintrag[]) ?? [],
    zuletztGekocht: (row.zuletzt_gekocht as string | null) ?? null,
    malGekocht: (row.mal_gekocht as number) ?? 0,
    vermeiden: (row.vermeiden as boolean) ?? false,
    erstelltVon: (row.erstellt_von as Chef) ?? '',
    erstelltAm: (row.erstellt_am as string) ?? '',
    manuellGespeichert: (row.manuell_gespeichert as boolean) ?? true,
  }
}

export async function loadRezeptbuch(): Promise<RezeptbuchEntry[]> {
  const familyId = getFamilyId()
  if (!familyId) return []
  const { data, error } = await supabase
    .from('recipe_book')
    .select('*')
    .eq('family_id', familyId)
    .order('erstellt_am', { ascending: false })
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToEntry)
}

export async function saveRezeptToBook(rezept: Rezept, erstelltVon: Chef): Promise<RezeptbuchEntry | null> {
  const familyId = getFamilyId()
  if (!familyId) return null
  let kategorie: string | null = null
  try {
    const resp = await fetch('/api/rezeptbuch/kategorisieren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rezept.name, zutaten: rezept.zutaten }),
    })
    if (resp.ok) {
      const d = await resp.json() as { kategorie?: string }
      kategorie = d.kategorie ?? null
    }
  } catch { /* continue without category */ }
  const { data, error } = await supabase
    .from('recipe_book')
    .insert({ family_id: familyId, rezept, kategorie, erstellt_von: erstelltVon, manuell_gespeichert: true })
    .select('*')
    .single()
  if (error || !data) return null
  return rowToEntry(data as Record<string, unknown>)
}

export async function autoSaveRezeptToBook(gerName: string, rezept: Rezept, erstelltVon: Chef): Promise<RezeptbuchEntry | null> {
  const familyId = getFamilyId()
  if (!familyId) return null
  const { data: existing } = await supabase
    .from('recipe_book')
    .select('id')
    .eq('family_id', familyId)
    .ilike('rezept->>name', gerName)
    .maybeSingle()
  if (existing) return null
  let kategorie: string | null = null
  try {
    const resp = await fetch('/api/rezeptbuch/kategorisieren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rezept.name, zutaten: rezept.zutaten }),
    })
    if (resp.ok) {
      const d = await resp.json() as { kategorie?: string }
      kategorie = d.kategorie ?? null
    }
  } catch { /* no category */ }
  const { data, error } = await supabase
    .from('recipe_book')
    .insert({ family_id: familyId, rezept, kategorie, erstellt_von: erstelltVon, manuell_gespeichert: false })
    .select('*')
    .single()
  if (error || !data) return null
  return rowToEntry(data as Record<string, unknown>)
}

export async function setVermeidenByName(gerName: string, vermeiden: boolean): Promise<void> {
  const familyId = getFamilyId()
  if (!familyId) return
  const { data } = await supabase
    .from('recipe_book')
    .select('id')
    .eq('family_id', familyId)
    .ilike('rezept->>name', gerName)
    .maybeSingle()
  if (!data) return
  await supabase
    .from('recipe_book')
    .update({ vermeiden, updated_at: new Date().toISOString() })
    .eq('id', (data as { id: string }).id)
}

export async function updateRezeptInBook(id: string, rezept: Rezept): Promise<void> {
  await supabase
    .from('recipe_book')
    .update({ rezept, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteRezeptFromBook(id: string): Promise<void> {
  await supabase.from('recipe_book').delete().eq('id', id)
}

export async function toggleFavoritInBook(id: string, isFavorit: boolean): Promise<void> {
  await supabase
    .from('recipe_book')
    .update({ is_favorit: isFavorit, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function markGekochtInBook(id: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('recipe_book')
    .select('mal_gekocht')
    .eq('id', id)
    .single()
  const current = (data as { mal_gekocht?: number } | null)?.mal_gekocht ?? 0
  await supabase
    .from('recipe_book')
    .update({ zuletzt_gekocht: today, mal_gekocht: current + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
}
