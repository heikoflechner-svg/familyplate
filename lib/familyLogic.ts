import { supabase, FAMILY_ID } from './supabase'
import type { Chef, FamilyMember, FamilyProfile, WeekPlanEntry } from './state'

export const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: 'PA', name: 'Heiko', allergien: [], vorlieben: [] },
  { id: 'MA', name: 'Sabine', allergien: [], vorlieben: [] },
  { id: 'TI', name: 'Tim', allergien: [], vorlieben: [] },
]

export const CHEF_ORDER: Chef[] = ['PA', 'MA', 'TI']

export async function loadFamilyProfile(): Promise<FamilyProfile | null> {
  const { data } = await supabase
    .from('family_profiles')
    .select('members, onboarding_done')
    .eq('family_id', FAMILY_ID)
    .single()

  if (!data || !data.onboarding_done) return null
  return { members: data.members as FamilyMember[] }
}

export async function saveFamilyProfile(profile: FamilyProfile): Promise<void> {
  const { data: existing } = await supabase
    .from('family_profiles')
    .select('id')
    .eq('family_id', FAMILY_ID)
    .single()

  const payload = {
    members: profile.members,
    onboarding_done: true,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    await supabase.from('family_profiles').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('family_profiles').insert({ family_id: FAMILY_ID, ...payload })
  }
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
      const a = m.allergien.length ? `kein(e) ${m.allergien.join(', ')}` : 'keine Einschränkungen'
      const v = m.vorlieben.length ? `mag ${m.vorlieben.join(', ')}` : ''
      return `${m.name} (${m.id}): ${[a, v].filter(Boolean).join('; ')}`
    })
    .join('. ')
}
