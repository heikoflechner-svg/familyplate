import { supabase, setFamilyId } from './supabase'

// Sondermarker: Nutzer ist eingeloggt, hat aber noch keine Familie.
// Wird in Etappe 2 (Registrierung) von FamilyPlateApp ausgewertet.
export const SETUP_NEEDED = '__setup_needed__'

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  setFamilyId('')
  await supabase.auth.signOut()
}

export async function changePassword(currentPw: string, newPw: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return { error: 'Nicht eingeloggt' }
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: currentPw })
  if (authError) return { error: 'Aktuelles Passwort ist falsch' }
  const { error: updateError } = await supabase.auth.updateUser({ password: newPw })
  return { error: updateError?.message ?? null }
}

export function onAuthChange(callback: (chef: string | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) {
      setFamilyId('')
      callback(null)
      return
    }
    try {
      // Pfad 1: Legacy – app_metadata (manuell gesetzte Nutzer: PA/MA/TI)
      const meta = session.user.app_metadata as { family_id?: string; slot?: string }
      if (meta?.family_id && meta?.slot) {
        setFamilyId(meta.family_id)
        callback(meta.slot)
        return
      }

      // Pfad 2: Neues System – family_members-Tabelle
      const { data: member } = await supabase
        .from('family_members')
        .select('family_id, kuerzel')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (member?.family_id && member?.kuerzel) {
        setFamilyId(member.family_id)
        callback(member.kuerzel)
        return
      }

      // Eingeloggt, aber noch keine Familie → Registrierungs-Setup nötig
      callback(SETUP_NEEDED)
    } catch {
      callback(null)
    }
  })
  return () => subscription.unsubscribe()
}
