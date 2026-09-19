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
      const { data } = await supabase
        .from('family_members')
        .select('family_id, slot')
        .eq('user_id', session.user.id)
        .single()
      if (!data) {
        stagingLog('AUTH_NO_FAMILY uid=' + session.user.id)
        callback(null)
        return
      }
      setFamilyId(data.family_id as string)
      stagingLog('AUTH_FAMILY family=' + data.family_id + ' slot=' + data.slot)
      callback(data.slot as string)
    } catch (err) {
      stagingLog('AUTH_ERR ' + String(err))
      callback(null)
    }
  })
  return () => subscription.unsubscribe()
}
