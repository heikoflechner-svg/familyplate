import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://kzvsmlrnoojucahoysmf.supabase.co',
  'sb_publishable_h1f5rKewTw8auG94MvcesQ_EqQ5DYMP'
)

// Als Heiko einloggen um RLS zu umgehen
const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: 'heiko@flechner-family.de',
  password: 'Heiko1',
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
