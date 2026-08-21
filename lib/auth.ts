import { supabase } from './supabase'
import type { Chef } from './state'

export const EMAIL_BY_CHEF: Record<Chef, string> = {
  PA: 'heiko@flechner-family.de',
  MA: 'sabine@flechner-family.de',
  TI: 'tim@flechner-family.de',
}

const CHEF_BY_EMAIL: Record<string, Chef> = Object.fromEntries(
  (Object.entries(EMAIL_BY_CHEF) as [Chef, string][]).map(([chef, email]) => [email, chef])
)

export async function signIn(chef: Chef, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: EMAIL_BY_CHEF[chef],
    password,
  })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export function onAuthChange(callback: (chef: Chef | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    const email = session?.user?.email ?? null
    callback(email ? (CHEF_BY_EMAIL[email] ?? null) : null)
  })
  return () => subscription.unsubscribe()
}
