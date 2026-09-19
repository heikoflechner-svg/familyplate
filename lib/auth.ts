import { supabase, setFamilyId } from './supabase'
import { stagingLog } from '../app/ErrorOverlay'

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  stagingLog('SIGN_IN_START email=' + email)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  stagingLog('SIGN_IN_DONE error=' + (error?.message ?? 'none'))
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  setFamilyId('')
  await supabase.auth.signOut()
}

export function onAuthChange(callback: (chef: string | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    stagingLog('AUTH_EVENT event=' + event + ' uid=' + (session?.user?.id ?? 'null'))
    if (!session?.user) {
      setFamilyId('')
      callback(null)
      return
    }
    try {
      const meta = session.user.app_metadata as { family_id?: string; slot?: string }
      if (meta?.family_id && meta?.slot) {
        setFamilyId(meta.family_id)
        stagingLog('AUTH_FAMILY family=' + meta.family_id + ' slot=' + meta.slot)
        callback(meta.slot)
        return
      }
      stagingLog('AUTH_NO_FAMILY uid=' + session.user.id + ' meta=' + JSON.stringify(meta))
      callback(null)
    } catch (err) {
      stagingLog('AUTH_ERR ' + String(err))
      callback(null)
    }
  })
  return () => subscription.unsubscribe()
}
