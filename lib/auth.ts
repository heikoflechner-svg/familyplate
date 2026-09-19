import { supabase, setFamilyId } from './supabase'

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  setFamilyId('')
  await supabase.auth.signOut()
}

export function onAuthChange(callback: (chef: string | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) {
      setFamilyId('')
      callback(null)
      return
    }
    try {
      const meta = session.user.app_metadata as { family_id?: string; slot?: string }
      if (meta?.family_id && meta?.slot) {
        setFamilyId(meta.family_id)
        callback(meta.slot)
        return
      }
      callback(null)
    } catch {
      callback(null)
    }
  })
  return () => subscription.unsubscribe()
}
