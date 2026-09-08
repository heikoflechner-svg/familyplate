/**
 * Live-Test: Nächste Woche vorbereiten
 *  1. week_start in DB gesetzt wenn Plan bestätigt (KW-Anzeige)
 *  2. "Nächste Woche"-Sektion sichtbar bei bestätigtem Plan
 *  3. Wochenchef für nächste Woche auswählen → next_week_data in DB
 *  4. Wunsch eintragen → next_week_data.wishes
 *  5. "Neue Woche starten"-Button wenn week_start veraltet
 *  6. activateNextWeek: next_week_data → Hauptspalten, Felder zurückgesetzt
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const HEIKO_EMAIL  = process.env.TEST_HEIKO_EMAIL
const HEIKO_PW     = process.env.TEST_HEIKO_PW
const SABINE_PW    = process.env.TEST_SABINE_PW
const FAMILY_ID    = 'flechner'
const BASE         = 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_KEY || !HEIKO_EMAIL || !HEIKO_PW || !SABINE_PW) {
  console.error('Fehlende Umgebungsvariablen'); process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const shot = (page, name) => page.screenshot({ path: `nw-${name}.png` })

let pass = 0; let fail = 0
function check(label, ok) {
  if (ok) { console.log(`  ✅ ${label}`); pass++ }
  else    { console.log(`  ❌ ${label}`); fail++ }
}

async function login(page, name, pw) {
  await page.goto(BASE)
  await page.waitForTimeout(2000)
  await page.locator('text=' + name).first().click().catch(() => {})
  await page.waitForTimeout(400)
  const pwInput = page.locator('input[type="password"]')
  if (await pwInput.count() > 0) {
    await pwInput.fill(pw)
    await page.locator('button').filter({ hasText: /anmeld/i }).first().click().catch(() => {})
  }
  await page.waitForSelector('.nav', { timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

// Hilfsfunktion: nächsten Montag ermitteln
function getNextMonday() {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow))
  return d.toISOString().slice(0, 10)
}
// Letzten Montag ermitteln (für week_start "veraltet")
function getLastMonday() {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) - 7)
  return d.toISOString().slice(0, 10)
}
// KW einer ISO-Datum-Zeichenfolge
function getKW(isoDate) {
  const d = new Date(isoDate + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const yearStart = new Date(thu.getFullYear(), 0, 4)
  return Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// ─── Setup ───────────────────────────────────────────────────────────────────
console.log('\n[Setup] DB Reset – bestätigter Plan, week_start = aktuelle Woche…')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
const { data: existing } = await supabase.from('week_plans')
  .select('id').eq('family_id', FAMILY_ID).limit(1).single()
if (!existing?.id) { console.error('Kein week_plans-Eintrag'); process.exit(1) }

// Aktuelle Woche (nicht veraltet): "Neue Woche starten"-Button soll NICHT erscheinen
const todayMonday = (() => {
  const d = new Date(); const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().slice(0, 10)
})()

await supabase.from('week_plans').update({
  plan_data: [{ tag: 'Montag', slot: 'Abend', emoji: '🍝', gericht: 'Pasta', minuten: 30, quelle: 'test', chef: 'PA' }],
  meals_data: {},
  wishes: [],
  proposals: [],
  plan_confirmed: true,
  shopping_list: [],
  shopping_day: null,
  shopping_persons: null,
  wochenchef: 'PA',
  week_start: todayMonday,
  next_week_start: null,
  next_week_data: null,
}).eq('id', existing.id)
await supabase.auth.signOut()
console.log(`  week_start = ${todayMonday} (aktuelle Woche)`)

const browser = await chromium.launch({ headless: true })

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1+2: KW-Anzeige + "Nächste Woche"-Sektion bei bestätigtem Plan
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1+2] KW-Anzeige + Nächste-Woche-Sektion (Heiko = Wochenchef)')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await shot(page, '01-home-confirmed')

  const body = await page.locator('body').innerText()
  const kw = getKW(todayMonday)

  check(`KW ${kw} im UI sichtbar`, body.includes(`KW ${kw}`))
  check('"Nächste Woche"-Sektion sichtbar', body.toLowerCase().includes('nächste woche'))
  check('"Wochenchef festlegen"-Label sichtbar', body.toLowerCase().includes('wochenchef festlegen'))
  check('"Neue Woche starten"-Button NICHT sichtbar (Woche noch aktuell)', !body.includes('Neue Woche starten'))

  await page.close()
}

// TEST 2b: Nicht-Wochenchef sieht Wunsch-Eingabe
console.log('\n[2b] Nicht-Wochenchef (Sabine) sieht Wunsch-Eingabe')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Sabine', SABINE_PW)
  await shot(page, '02-sabine-home')

  const body = await page.locator('body').innerText()
  check('"Nächste Woche"-Sektion sichtbar für Sabine', body.toLowerCase().includes('nächste woche'))
  const wishInput = await page.locator('input[placeholder*="Wunsch"]').count()
  check('Wunsch-Eingabe vorhanden', wishInput > 0)

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Wochenchef für nächste Woche auswählen
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] Heiko wählt Sabine als Wochenchef für nächste Woche')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  // "Sabine"-Button im Wochenchef-Picker klicken (Button hat mehrzeiligen Text wie "Sabine\n★ Empfehlung")
  const sabineBtn = page.locator('button').filter({ hasText: 'Sabine' }).first()
  if (await sabineBtn.count() > 0) {
    await sabineBtn.click()
    await page.waitForTimeout(2500)
    await shot(page, '03-sabine-selected')
    console.log('  Sabine-Button geklickt')
  } else {
    console.log('  ❌ Sabine-Button nicht gefunden')
    fail++
  }

  // DB-Check: next_week_data.wochenchef = 'MA'
  await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
  const { data: dbCheck } = await supabase.from('week_plans')
    .select('next_week_data, next_week_start').eq('family_id', FAMILY_ID).limit(1).single()
  await supabase.auth.signOut()

  const nwd = dbCheck?.next_week_data
  check('next_week_data.wochenchef = MA (Sabine)', nwd?.wochenchef === 'MA')
  check('next_week_start gesetzt', dbCheck?.next_week_start != null)

  // UI: Sabine sollte nun mit ✓ markiert sein
  const body = await page.locator('body').innerText()
  check('Sabine als nächster Wochenchef im UI sichtbar', body.includes('Sabine'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Wunsch eintragen (Sabine)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] Sabine trägt Wunsch für nächste Woche ein')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Sabine', SABINE_PW)

  const wishInput = page.locator('input[placeholder*="Wunsch"]').first()
  if (await wishInput.count() > 0) {
    await wishInput.fill('Pizza bitte!')
    await wishInput.press('Enter')
    await page.waitForTimeout(2500)
    await shot(page, '04-sabine-wish')
    console.log('  Wunsch eingegeben')
  } else {
    console.log('  ❌ Wunsch-Input nicht gefunden')
    fail++
  }

  // DB-Check: next_week_data.wishes enthält Sabiners Wunsch
  await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
  const { data: dbWish } = await supabase.from('week_plans')
    .select('next_week_data').eq('family_id', FAMILY_ID).limit(1).single()
  await supabase.auth.signOut()

  const wishes = dbWish?.next_week_data?.wishes ?? []
  const found = wishes.find(w => w.text === 'Pizza bitte!')
  check('Wunsch in next_week_data.wishes gespeichert', !!found)
  check('Wunsch von Sabine (MA)', found?.person === 'MA')

  // UI: Wunsch soll als gespeichert angezeigt werden
  const body = await page.locator('body').innerText()
  check('"Pizza bitte!" im UI sichtbar', body.includes('Pizza bitte!'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: "Neue Woche starten"-Button erscheint wenn week_start veraltet
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] "Neue Woche starten"-Button bei veralteter Woche')
const lastMonday = getLastMonday()
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({ week_start: lastMonday }).eq('id', existing.id)
await supabase.auth.signOut()
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await shot(page, '05-past-week')

  const body = await page.locator('body').innerText()
  check('"Neue Woche starten"-Button sichtbar', body.includes('Neue Woche starten'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: "Neue Woche starten" aktiviert Next-Week-Daten
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] "Neue Woche starten" – next_week_data → Hauptspalten')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  // "Neue Woche starten" klicken
  const startBtn = page.locator('button').filter({ hasText: /neue woche starten/i }).first()
  if (await startBtn.count() > 0) {
    await startBtn.click()
    await page.waitForTimeout(3000)
    await shot(page, '06-after-activate')
    console.log('  "Neue Woche starten" geklickt')
  } else {
    console.log('  ❌ "Neue Woche starten" nicht gefunden')
    fail++
  }

  // DB-Check: wochenchef = 'MA', next_week_data = null, plan_data = []
  await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
  const { data: dbAfter } = await supabase.from('week_plans')
    .select('wochenchef, plan_data, plan_confirmed, next_week_data, next_week_start, week_start')
    .eq('family_id', FAMILY_ID).limit(1).single()
  await supabase.auth.signOut()

  check('wochenchef auf MA (Sabine) umgestellt', dbAfter?.wochenchef === 'MA')
  check('plan_data leer (neue Woche ungeplanst)', (dbAfter?.plan_data ?? []).length === 0)
  check('plan_confirmed = false', dbAfter?.plan_confirmed === false)
  check('next_week_data geleert', dbAfter?.next_week_data == null)
  check('next_week_start geleert', dbAfter?.next_week_start == null)

  const nextMon = getNextMonday()
  // week_start sollte auf nächsten Montag gesetzt sein (oder was next_week_start war)
  const newWs = dbAfter?.week_start
  check(`week_start auf ${nextMon} (nächsten Montag) gesetzt`, newWs === nextMon)

  // UI: Sabine ist jetzt Wochenchef, leerer Home-Screen
  const body = await page.locator('body').innerText()
  check('Wochenchef-Info zeigt Sabine', body.includes('Sabine'))

  await page.close()
}

// ─── Aufräumen ────────────────────────────────────────────────────────────────
await browser.close()
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  plan_data: [], meals_data: {}, wishes: [], proposals: [], plan_confirmed: false,
  shopping_list: [], shopping_day: null, shopping_persons: null,
  wochenchef: 'PA', week_start: null, next_week_start: null, next_week_data: null,
}).eq('id', existing.id)
await supabase.auth.signOut()

console.log(`\n${'─'.repeat(40)}`)
console.log(`Ergebnis: ${pass} ✅  ${fail} ❌  (${pass + fail} Tests)`)
if (fail > 0) process.exit(1)
