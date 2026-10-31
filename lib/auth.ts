import { supabase, setFamilyId } from './supabase'
import { saveIdentity, loadIdentity, clearAllOfflineData } from './offlineCache'

export const SETUP_NEEDED = '__setup_needed__'

// Tracks whether the current user explicitly clicked "Abmelden".
// Without this flag we can't distinguish an intentional sign-out from a
// failed token refresh caused by the device being offline.
let explicitSignOut = false

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  explicitSignOut = true
  clearAllOfflineData()
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
      // Consume the flag immediately so the next event is unaffected.
      const wasExplicit = explicitSignOut
      explicitSignOut = false

      // A failed token refresh while offline must NEVER log the user out.
      // Only treat a null session as a real sign-out when:
      //   a) the user explicitly clicked "Abmelden", OR
      //   b) the device is online (server genuinely rejected the session)
      const isOnline = typeof navigator === 'undefined' || navigator.onLine
      if (!wasExplicit && !isOnline) {
        const cached = loadIdentity()
        if (cached) {
          setFamilyId(cached.familyId)
          callback(cached.kuerzel)
          return
        }
      }

      setFamilyId('')
      callback(null)
      return
    }

    // Valid session – reset flag in case a previous sign-out was interrupted.
    explicitSignOut = false

    try {
      // Pfad 1: Legacy – app_metadata (manuell gesetzte Nutzer: PA/MA/TI)
      const meta = session.user.app_metadata as { family_id?: string; slot?: string }
      if (meta?.family_id && meta?.slot) {
        setFamilyId(meta.family_id)
        saveIdentity({ familyId: meta.family_id, kuerzel: meta.slot })
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
        saveIdentity({ familyId: member.family_id, kuerzel: member.kuerzel })
        callback(member.kuerzel)
        return
      }

      // Eingeloggt, aber noch keine Familie → Registrierungs-Setup nötig
      callback(SETUP_NEEDED)
    } catch {
      // Offline-Fallback: DB-Abfrage (family_members) schlug fehl, aber Session ist gültig.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = loadIdentity()
        if (cached) {
          setFamilyId(cached.familyId)
          callback(cached.kuerzel)
          return
        }
      }
      callback(null)
    }
  })
  return () => subscription.unsubscribe()
}
