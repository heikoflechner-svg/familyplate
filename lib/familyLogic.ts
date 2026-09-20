import { supabase, getFamilyId } from './supabase'
import type { Chef, FamilyMember, FamilyProfile, WeekPlanEntry } from './state'
import { DEFAULT_LAEDEN } from './state'

export const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: 'M1', name: 'Person 1', allergien: [], vorlieben: [] },
  { id: 'M2', name: 'Person 2', allergien: [], vorlieben: [] },
  { id: 'M3', name: 'Person 3', allergien: [], vorlieben: [] },
]

export const CHEF_ORDER: Chef[] = DEFAULT_MEMBERS.map(m => m.id)

export async function loadFamilyProfile(): Promise<FamilyProfile | null> {
  if (new Date().getFullYear() > 0) throw new Error('TEST – Ladefehler simuliert') // TEMPORÄR – wird sofort entfernt
  const { data, error } = await supabase
    .from('family_profiles')
    .select('members, onboarding_done, laeden, zutaten_laden')
    .eq('family_id', getFamilyId())
    .single()

  if (error) {
    // PGRST116 = "0 rows returned by .single()" → genuinely no profile yet, not an error
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error  // network, auth, timeout, etc. → caller handles as load failure
  }
  if (!data) return null
  if (!data.onboarding_done) return null
  return {
    members: data.members as FamilyMember[],
    laeden: (data.laeden as string[] | null) ?? DEFAULT_LAEDEN,
    zutatenLaden: (data.zutaten_laden as Record<string, string> | null) ?? {},
  }
}

export async function saveFamilyProfile(profile: FamilyProfile): Promise<void> {
  const { error } = await supabase
    .from('family_profiles')
    .upsert(
      {
        family_id: getFamilyId(),
        members: profile.members,
        laeden: profile.laeden,
        zutaten_laden: profile.zutatenLaden,
        onboarding_done: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'family_id' }
    )
  if (error) throw new Error(error.message)
}

export function applyChefStats(members: FamilyMember[], confirmedEntries: WeekPlanEntry[], today: string): FamilyMember[] {
  const counts: Partial<Record<Chef, number>> = {}
  for (const e of confirmedEntries) {
    counts[e.chef] = (counts[e.chef] ?? 0) + 1
  }
  return members.map(m => {
    const added = counts[m.id] ?? 0
    if (added === 0) return m
    return {
      ...m,
      chefStat: {
        count: (m.chefStat?.count ?? 0) + added,
        lastCook: today,
      },
    }
  })
}

export function buildFamilyPrompt(members: FamilyMember[]): string {
  return members
    .map(m => {
      const allergien = m.allergien ?? []
      const vorlieben = m.vorlieben ?? []
      const a = allergien.length ? `kein(e) ${allergien.join(', ')}` : 'keine Einschränkungen'
      const v = vorlieben.length ? `mag ${vorlieben.join(', ')}` : ''
      return `${m.name} (${m.id}): ${[a, v].filter(Boolean).join('; ')}`
    })
    .join('. ')
}
