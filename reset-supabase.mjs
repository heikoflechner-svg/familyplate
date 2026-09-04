import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const HEIKO_EMAIL = process.env.TEST_HEIKO_EMAIL
const HEIKO_PW    = process.env.TEST_HEIKO_PW

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fehlend: SUPABASE_URL / SUPABASE_ANON_KEY (oder NEXT_PUBLIC_-Varianten)')
  process.exit(1)
}
if (!HEIKO_EMAIL || !HEIKO_PW) {
  console.error('Fehlend: TEST_HEIKO_EMAIL / TEST_HEIKO_PW')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Als Heiko einloggen um RLS zu umgehen
const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: HEIKO_EMAIL,
  password: HEIKO_PW,
})
if (loginErr) { console.error('Login fehlgeschlagen:', loginErr.message); process.exit(1) }
console.log('Eingeloggt als Heiko')

// Zeile löschen
const { error: delErr, count } = await supabase
  .from('week_plans')
  .delete({ count: 'exact' })
  .eq('family_id', 'flechner')

if (delErr) {
  console.error('Löschen fehlgeschlagen:', delErr.message)
} else {
  console.log(`Gelöscht: ${count} Zeile(n) in week_plans`)
}

// Verify: family_profiles unberührt?
const { data: profile } = await supabase
  .from('family_profiles')
  .select('family_id, members')
  .eq('family_id', 'flechner')
  .single()
console.log('family_profiles unberührt:', profile?.members?.map(m => m.name).join(', ') ?? 'nicht gefunden')

await supabase.auth.signOut()
console.log('Fertig.')
