import fs from 'fs'

// ── Credentials aus .env.local ────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
)
const BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const USERS = {
  'Heiko (Flechner/PA)':  { email: env.TEST_HEIKO_EMAIL, pw: env.TEST_HEIKO_PW,  family: 'flechner', slot: 'PA' },
  'Tim   (Flechner/TI)':  { email: 'tim@flechner-family.de', pw: env.TEST_TIM_PW, family: 'flechner', slot: 'TI' },
  'Anna  (Mueller/M1)':   { email: 'anna@mueller.test',  pw: 'Test1234!', family: 'mueller', slot: 'M1' },
  'Klaus (Mueller/M2)':   { email: 'klaus@mueller.test', pw: 'Test1234!', family: 'mueller', slot: 'M2' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function login(email, pw) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error_description ?? d.msg ?? JSON.stringify(d))
  return d.access_token
}

async function query(jwt, table) {
  const cols = table === 'family_profiles' ? 'family_id,members' : 'family_id,wochenchef'
  const r = await fetch(`${BASE}/rest/v1/${table}?select=${cols}`, {
    headers: { 'apikey': ANON, 'Authorization': `Bearer ${jwt}`, 'Accept': 'application/json' },
  })
  return r.json()
}

function decodeJwtAppMeta(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return { family_id: payload.app_metadata?.family_id, slot: payload.app_metadata?.slot }
  } catch { return {} }
}

// ── Test ──────────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? '  ← ' + detail : ''}`)
    failed++
  }
}

console.log('\n══ FamilyPlate Staging — Login & Trennungstest ══\n')

const tokens = {}

// ── Phase 1: Login ────────────────────────────────────────────────────────────
console.log('Phase 1: Login')
for (const [label, u] of Object.entries(USERS)) {
  try {
    tokens[label] = await login(u.email, u.pw)
    ok(`Login ${label}`, true)
  } catch (e) {
    ok(`Login ${label}`, false, e.message)
    tokens[label] = null
  }
}

// ── Phase 2: family_members Lookup ───────────────────────────────────────────
console.log('\nPhase 2: App-Metadata im JWT (family_id + slot)')
for (const [label, u] of Object.entries(USERS)) {
  if (!tokens[label]) { ok(`app_metadata ${label}`, false, 'kein Token'); continue }
  const meta = decodeJwtAppMeta(tokens[label])
  ok(`${label} → family_id='${u.family}'`, meta.family_id === u.family,
     `war: ${meta.family_id ?? '(fehlt)'}`)
  ok(`${label} → slot='${u.slot}'`, meta.slot === u.slot,
     `war: ${meta.slot ?? '(fehlt)'}`)
}

// ── Phase 3: family_profiles Datentrennung ────────────────────────────────────
console.log('\nPhase 3: family_profiles — Datentrennung')
for (const [label, u] of Object.entries(USERS)) {
  if (!tokens[label]) { ok(`family_profiles ${label}`, false, 'kein Token'); continue }
  const rows = await query(tokens[label], 'family_profiles')
  const ids = Array.isArray(rows) ? rows.map(r => r.family_id) : []
  ok(`${label} sieht genau 1 Profil`, ids.length === 1, `sieht: [${ids.join(',')}]`)
  ok(`${label} sieht nur '${u.family}'`, ids.every(id => id === u.family),
     `sieht: [${ids.join(',')}]`)

  const otherFamily = u.family === 'flechner' ? 'mueller' : 'flechner'
  ok(`${label} sieht NICHT '${otherFamily}'`, !ids.includes(otherFamily))

  // Members prüfen
  if (ids.length === 1) {
    const members = rows[0].members
    const mIds = Array.isArray(members) ? members.map(m => m.id) : []
    const expectedSlots = u.family === 'flechner' ? ['PA','MA','TI'] : ['M1','M2','M3']
    ok(`  Member-IDs korrekt [${expectedSlots.join(',')}]`,
       expectedSlots.every(s => mIds.includes(s)), `war: [${mIds.join(',')}]`)
  }
}

// ── Phase 4: week_plans Datentrennung ────────────────────────────────────────
console.log('\nPhase 4: week_plans — Datentrennung')
for (const [label, u] of Object.entries(USERS)) {
  if (!tokens[label]) { ok(`week_plans ${label}`, false, 'kein Token'); continue }
  const rows = await query(tokens[label], 'week_plans')
  const ids = Array.isArray(rows) ? rows.map(r => r.family_id) : []
  ok(`${label} sieht genau 1 Wochenplan`, ids.length === 1, `sieht: [${ids.join(',')}]`)
  ok(`${label} sieht nur '${u.family}'`, ids.every(id => id === u.family),
     `sieht: [${ids.join(',')}]`)
  const otherFamily = u.family === 'flechner' ? 'mueller' : 'flechner'
  ok(`${label} sieht NICHT '${otherFamily}'`, !ids.includes(otherFamily))
}

// ── Ergebnis ──────────────────────────────────────────────────────────────────
console.log(`\n══ Ergebnis: ${passed}/${passed + failed} Tests bestanden ══\n`)
if (failed > 0) process.exit(1)
