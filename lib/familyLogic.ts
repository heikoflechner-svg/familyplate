import { supabase, getFamilyId } from './supabase'
import type { Chef, FamilyMember, FamilyProfile, WeekPlanEntry, TagMahlzeitenKonfig, ErnährungsVorgabe } from './state'
import { DEFAULT_LAEDEN } from './state'

export const MEMBER_PALETTE = [
  { bg: '#E6F1FB', c: '#0C447C' },
  { bg: '#E1F5EE', c: '#0F6E56' },
  { bg: '#FBEAF0', c: '#72243E' },
  { bg: '#FEF3C7', c: '#92400E' },
]

export function buildMemberCfg(members: FamilyMember[]): Record<string, { bg: string; c: string }> {
  return Object.fromEntries(members.map((m, i) => [m.id, MEMBER_PALETTE[i % MEMBER_PALETTE.length]]))
}

export const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: 'M1', name: '', allergien: [], vorlieben: [], abneigungen: [] },
  { id: 'M2', name: '', allergien: [], vorlieben: [], abneigungen: [] },
  { id: 'M3', name: '', allergien: [], vorlieben: [], abneigungen: [] },
]

export const CHEF_ORDER: Chef[] = DEFAULT_MEMBERS.map(m => m.id)

export async function loadFamilyProfile(): Promise<FamilyProfile | null> {
  const { data, error } = await supabase
    .from('family_profiles')
    .select('members, onboarding_done, laeden, zutaten_laden, default_meal_config, default_plan_we, ernaehrungs_vorgabe')
    .eq('family_id', getFamilyId())
    .single()

  if (error) {
    // PGRST116 = "0 rows returned by .single()" → genuinely no profile yet, not an error
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error  // network, auth, timeout, etc. → caller handles as load failure
  }
  if (!data) return null
  if (!data.onboarding_done) return null

  // Split zutaten_laden into three semantic maps using __wg.* and __alias.* namespace prefixes
  const raw = (data.zutaten_laden as Record<string, string> | null) ?? {}
  const zutatenLaden: Record<string, string> = {}
  const zutatenWarengruppe: Record<string, string> = {}
  const zutatenAliase: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('__wg.')) zutatenWarengruppe[key.slice(5)] = value
    else if (key.startsWith('__alias.')) zutatenAliase[key.slice(8)] = value
    else zutatenLaden[key] = value
  }

  return {
    members: data.members as FamilyMember[],
    laeden: (data.laeden as string[] | null) ?? DEFAULT_LAEDEN,
    zutatenLaden,
    zutatenWarengruppe,
    zutatenAliase,
    defaultMealConfig: (data.default_meal_config as Record<string, TagMahlzeitenKonfig> | null) ?? undefined,
    defaultPlanWE: (data.default_plan_we as boolean | null) ?? undefined,
    ernährungsVorgabe: (data.ernaehrungs_vorgabe as ErnährungsVorgabe | null) ?? undefined,
  }
}

export async function saveFamilyProfile(profile: FamilyProfile): Promise<FamilyProfile> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Nicht eingeloggt.')

  const res = await fetch('/api/profile/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      members: profile.members,
      laeden: profile.laeden,
      zutatenLaden: profile.zutatenLaden,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `Speichern fehlgeschlagen (${res.status}).`)
  }

  const data = await res.json() as { profile: { members: FamilyMember[]; laeden: string[]; zutatenLaden: Record<string, string> } }
  // Preserve shopping-config fields not managed by this route
  return {
    ...profile,
    members: data.profile.members,
    laeden: data.profile.laeden,
    zutatenLaden: data.profile.zutatenLaden,
  }
}

export async function saveShoppingConfig(
  warengruppe: Record<string, string>,
  aliase: Record<string, string>,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Nicht eingeloggt.')

  const res = await fetch('/api/shopping-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ warengruppe, aliase }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `Speichern fehlgeschlagen (${res.status}).`)
  }
}

export async function incrementWochenchefStat(wochenchef: Chef, weekStart: string, profile: FamilyProfile): Promise<FamilyProfile | null> {
  if (!wochenchef) return null
  const member = profile.members.find(m => m.id === wochenchef)
  if (!member) return null
  if (member.wochenchefStat?.lastWeek === weekStart) return null
  const updatedMembers = profile.members.map(m =>
    m.id === wochenchef
      ? { ...m, wochenchefStat: { count: (m.wochenchefStat?.count ?? 0) + 1, lastWeek: weekStart } }
      : m
  )
  return saveFamilyProfile({ ...profile, members: updatedMembers })
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

const SAISONALE_ZUTATEN: Record<number, string[]> = {
  1: ['Porree', 'Sellerie', 'Rosenkohl', 'Grünkohl', 'Rote Bete', 'Chicorée'],
  2: ['Porree', 'Sellerie', 'Rosenkohl', 'Grünkohl', 'Chicorée', 'Feldsalat'],
  3: ['Spinat', 'Radieschen', 'Frühlingszwiebeln', 'Rhabarber', 'Bärlauch'],
  4: ['Spargel', 'Spinat', 'Radieschen', 'Rhabarber', 'Bärlauch'],
  5: ['Spargel', 'Erdbeeren', 'Spinat', 'Radieschen', 'Kohlrabi'],
  6: ['Erdbeeren', 'Erbsen', 'Kohlrabi', 'Bohnen', 'Kirschen', 'Zucchini'],
  7: ['Zucchini', 'Bohnen', 'Tomaten', 'Gurken', 'Himbeeren', 'Paprika'],
  8: ['Tomaten', 'Paprika', 'Auberginen', 'Zucchini', 'Heidelbeeren', 'Pfifferlinge'],
  9: ['Kürbis', 'Äpfel', 'Birnen', 'Zwetschgen', 'Feldsalat', 'Pilze'],
  10: ['Kürbis', 'Äpfel', 'Birnen', 'Rosenkohl', 'Feldsalat', 'Porree'],
  11: ['Rosenkohl', 'Grünkohl', 'Porree', 'Äpfel', 'Sellerie', 'Rote Bete'],
  12: ['Rosenkohl', 'Grünkohl', 'Porree', 'Sellerie', 'Rote Bete', 'Chicorée'],
}

export function buildErnährungsHinweis(vorgabe: ErnährungsVorgabe, month: number): string {
  const parts: string[] = []
  if (vorgabe.grundhaltung === 'vegan') {
    parts.push('Die Familie ernährt sich vegan – bitte ausschließlich vegane Gerichte (kein Fleisch, kein Fisch, keine Milchprodukte, keine Eier) einplanen.')
  } else if (vorgabe.grundhaltung === 'vegetarisch') {
    parts.push('Die Familie ernährt sich vegetarisch – bitte ausschließlich vegetarische Gerichte (kein Fleisch, kein Fisch) einplanen.')
  }
  if (vorgabe.vegetarischeTage?.length && vorgabe.grundhaltung !== 'vegan' && vorgabe.grundhaltung !== 'vegetarisch') {
    parts.push(`An folgenden Tagen bitte vegetarisch planen (kein Fleisch): ${vorgabe.vegetarischeTage.join(', ')}.`)
  }
  if (vorgabe.fleischMaxProWoche != null && vorgabe.fleischMaxProWoche >= 0 && vorgabe.grundhaltung !== 'vegan' && vorgabe.grundhaltung !== 'vegetarisch') {
    parts.push(`Bitte höchstens ${vorgabe.fleischMaxProWoche} Fleischgericht${vorgabe.fleischMaxProWoche !== 1 ? 'e' : ''} pro Woche einplanen.`)
  }
  if (vorgabe.fischMinProWoche && vorgabe.fischMinProWoche > 0 && vorgabe.grundhaltung !== 'vegan' && vorgabe.grundhaltung !== 'vegetarisch') {
    const modus = vorgabe.fischModus === 'etwa' ? 'etwa' : 'mindestens'
    parts.push(`Bitte ${modus} ${vorgabe.fischMinProWoche} Fischgericht${vorgabe.fischMinProWoche > 1 ? 'e' : ''} pro Woche einplanen.`)
  }
  if (vorgabe.saisonalBevorzugen) {
    const saisonZutaten = SAISONALE_ZUTATEN[month] ?? []
    if (saisonZutaten.length > 0) {
      parts.push(`Saisonale Zutaten bevorzugen – aktuell passend: ${saisonZutaten.join(', ')}.`)
    }
  }
  return parts.join(' ')
}

export function buildFamilyPrompt(members: FamilyMember[]): string {
  const profiles = members
    .map(m => {
      const allergien = m.allergien ?? []
      const vorlieben = m.vorlieben ?? []
      const abneigungen = m.abneigungen ?? []
      const a = allergien.length
        ? `Unverträglichkeiten: ${allergien.join(', ')}`
        : 'keine Unverträglichkeiten'
      const v = vorlieben.length ? `mag ${vorlieben.join(', ')}` : ''
      const n = abneigungen.length ? `mag nicht ${abneigungen.join(', ')}` : ''
      return `${m.name} (${m.id}): ${[a, v, n].filter(Boolean).join('; ')}`
    })
    .join('. ')

  const checks = members
    .filter(m => (m.allergien ?? []).length > 0)
    .flatMap(m => (m.allergien ?? []).map(a => `${m.name}: kein(e) ${a}`))

  if (checks.length === 0) return profiles
  return `${profiles} | Allergiepflicht: ${checks.join('; ')}`
}
