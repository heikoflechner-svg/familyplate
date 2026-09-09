/**
 * Live-Test: Notfall-Korrektur (B1)
 *  1. Button "Mahlzeit kurzfristig ändern" sichtbar für Wochenchef nach Bestätigung
 *  2. Notfall-Screen öffnet sich mit Warnhinweis + Slot-Auswahl
 *  3. Mittag und Abend einzeln wählbar (Checkboxen)
 *  4. Rémy schlägt für gewählte Slots neue Gerichte vor
 *  5. Original-Gericht durchgestrichen sichtbar
 *  6. Chef-Wechsel in Ergebnissen möglich
 *  7. "Korrekturen übernehmen" schreibt neue Slots in DB
 *  8. Nicht-Wochenchef sieht den Button NICHT
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
const shot = (page, name) => page.screenshot({ path: `nb1-${name}.png` })

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
  await page.waitForTimeout(1200)
}

// ─── Setup ───────────────────────────────────────────────────────────────────
console.log('\n[Setup] DB Reset – bestätigter Plan mit 3 Tagen…')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
const { data: existing } = await supabase.from('week_plans')
  .select('id').eq('family_id', FAMILY_ID).limit(1).single()
if (!existing?.id) { console.error('Kein week_plans-Eintrag'); process.exit(1) }

const ORIG_MONTAG_ABEND = 'Spaghetti Bolognese'
const ORIG_DIENSTAG_ABEND = 'Hähnchen mit Reis'

await supabase.from('week_plans').update({
  plan_data: [
    { tag: 'Montag',    slot: 'Abend',  emoji: '🍝', gericht: ORIG_MONTAG_ABEND, minuten: 35, quelle: 'remy', chef: 'PA' },
    { tag: 'Dienstag',  slot: 'Mittag', emoji: '🌮', gericht: 'Tacos',                         minuten: 25, quelle: 'remy', chef: 'MA' },
    { tag: 'Dienstag',  slot: 'Abend',  emoji: '🍗', gericht: ORIG_DIENSTAG_ABEND,             minuten: 40, quelle: 'remy', chef: 'PA' },
    { tag: 'Mittwoch',  slot: 'Abend',  emoji: '🥗', gericht: 'Salat mit Tofu',                minuten: 20, quelle: 'remy', chef: 'TI' },
  ],
  meals_data: {},
  wishes: [],
  proposals: [],
  plan_confirmed: true,
  shopping_list: [],
  shopping_day: null,
  shopping_persons: null,
  wochenchef: 'PA',
  week_start: null,
  next_week_start: null,
  next_week_data: null,
}).eq('id', existing.id)
await supabase.auth.signOut()
console.log('  Setup fertig')

const browser = await chromium.launch({ headless: true })

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Button "Mahlzeit kurzfristig ändern" sichtbar für Wochenchef
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] Home-View: Notfall-Button für Wochenchef (Heiko) sichtbar')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await shot(page, '01-home-heiko')

  const body = await page.locator('body').innerText()
  check('"Mahlzeit kurzfristig ändern" sichtbar', body.includes('Mahlzeit kurzfristig ändern'))
  check('Woche ist bestätigt (✅ Woche bestätigt sichtbar)', body.includes('Woche bestätigt'))

  await page.close()
}

// TEST 1b: Nicht-Wochenchef (Sabine) sieht den Button NICHT
console.log('\n[1b] Nicht-Wochenchef (Sabine) sieht Notfall-Button NICHT')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Sabine', SABINE_PW)
  await shot(page, '01b-home-sabine')

  const body = await page.locator('body').innerText()
  check('Notfall-Button NICHT sichtbar für Sabine', !body.includes('Mahlzeit kurzfristig ändern'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Notfall-Screen öffnet sich korrekt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] Notfall-Screen: Warnhinweis + Slot-Auswahl')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  const notfallBtn = page.locator('button').filter({ hasText: 'Mahlzeit kurzfristig' }).first()
  await notfallBtn.click()
  await page.waitForTimeout(800)
  await shot(page, '02-notfall-screen')

  const body = await page.locator('body').innerText()
  check('Notfall-Screen geöffnet (🚨 Notfall-Korrektur)', body.includes('Notfall-Korrektur'))
  check('Warnhinweis sichtbar ("Korrektur der laufenden Woche")', body.includes('Korrektur der laufenden Woche'))
  check('Hinweis auf nächste Woche sichtbar', body.toLowerCase().includes('nächste woche'))
  check('Originalgericht "Spaghetti Bolognese" sichtbar', body.includes(ORIG_MONTAG_ABEND))
  check('Originalgericht "Hähnchen mit Reis" sichtbar', body.includes(ORIG_DIENSTAG_ABEND))
  check('Auswahl-Hinweis sichtbar', body.includes('Mindestens einen Slot'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Slots einzeln wählbar (Mittag und Abend separat)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] Slot-Auswahl: Mittag und Abend einzeln wählbar')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  const notfallBtn = page.locator('button').filter({ hasText: 'Mahlzeit kurzfristig' }).first()
  await notfallBtn.click()
  await page.waitForTimeout(800)

  // Dienstag-Mittag (Tacos) anklicken
  const dinstagMittagRow = page.locator('button').filter({ hasText: 'Tacos' }).first()
  const hasTacosBtn = await dinstagMittagRow.count() > 0
  check('Dienstag-Mittag (Tacos) ist anklickbar', hasTacosBtn)

  if (hasTacosBtn) {
    await dinstagMittagRow.click()
    await page.waitForTimeout(300)
    const body2 = await page.locator('body').innerText()
    check('Nach 1 Klick: Rémy-Button zeigt "1 Slot"', body2.includes('1 Slot') || body2.includes('1)'))
  }

  // Montag-Abend (Spaghetti) auch anklicken
  const montagAbendRow = page.locator('button').filter({ hasText: ORIG_MONTAG_ABEND }).first()
  const hasMontagBtn = await montagAbendRow.count() > 0
  check('Montag-Abend (Bolognese) ist anklickbar', hasMontagBtn)

  if (hasMontagBtn) {
    await montagAbendRow.click()
    await page.waitForTimeout(300)
    await shot(page, '03-slots-selected')
    const body3 = await page.locator('body').innerText()
    check('Nach 2 Klicks: Rémy-Button zeigt "2 Slots"', body3.includes('2 Slot'))
  }

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Rémy schlägt neues Gericht vor (1 Slot für Geschwindigkeit)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] Rémy schlägt für Montag-Abend neues Gericht vor (ca. 30s)')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  const notfallBtn = page.locator('button').filter({ hasText: 'Mahlzeit kurzfristig' }).first()
  await notfallBtn.click()
  await page.waitForTimeout(800)

  // Nur Montag-Abend auswählen
  const montagAbendRow = page.locator('button').filter({ hasText: ORIG_MONTAG_ABEND }).first()
  if (await montagAbendRow.count() > 0) await montagAbendRow.click()
  await page.waitForTimeout(300)

  // Rémy fragen
  const remyBtn = page.locator('button').filter({ hasText: /Rémy fragen/ }).first()
  check('Rémy-fragen-Button vorhanden', await remyBtn.count() > 0)
  if (await remyBtn.count() > 0) {
    await remyBtn.click()
    // Warten bis Loading weg ist (max 60s)
    await page.waitForFunction(() => !document.body.innerText.includes('Rémy plant Korrekturen'), { timeout: 65000 })
    await shot(page, '04-remy-results')
    const body = await page.locator('body').innerText()
    check('Ergebnis-Screen geöffnet ("Neue Vorschläge")', body.includes('Neue Vorschläge'))
    check(`Original (${ORIG_MONTAG_ABEND}) durchgestrichen sichtbar`, body.includes(ORIG_MONTAG_ABEND))
    check('"Korrekturen übernehmen"-Button sichtbar', body.includes('Korrekturen übernehmen'))
    check('Koch-Name (Heiko) im Ergebnis sichtbar', body.includes('Heiko'))
    check('↺ nochmal-Hinweis sichtbar', body.includes('↺') || body.includes('nochmal'))
  }

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: Korrekturen übernehmen → DB aktualisiert
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] Korrekturen übernehmen → plan_data aktualisiert')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  // Notfall-Screen öffnen
  await page.locator('button').filter({ hasText: 'Mahlzeit kurzfristig' }).first().click()
  await page.waitForTimeout(800)

  // Montag-Abend auswählen
  const montagAbendRow = page.locator('button').filter({ hasText: ORIG_MONTAG_ABEND }).first()
  if (await montagAbendRow.count() > 0) await montagAbendRow.click()
  await page.waitForTimeout(300)

  // Rémy fragen
  const remyBtn = page.locator('button').filter({ hasText: /Rémy fragen/ }).first()
  if (await remyBtn.count() > 0) {
    await remyBtn.click()
    await page.waitForFunction(() => !document.body.innerText.includes('Rémy plant Korrekturen'), { timeout: 65000 })
    await page.waitForTimeout(500)

    // Merke das neue Gericht (aus Ergebnis-Screen)
    const bodyResults = await page.locator('body').innerText()
    const hasNewPlan = bodyResults.includes('Neue Vorschläge')
    check('Ergebnis-Screen sichtbar vor Übernehmen', hasNewPlan)

    if (hasNewPlan) {
      // Übernehmen klicken
      const ueberBtn = page.locator('button').filter({ hasText: /Korrekturen übernehmen/ }).first()
      await ueberBtn.click()
      await page.waitForTimeout(3000)
      await shot(page, '05-after-accept')

      // Zurück auf Home – nicht mehr auf Notfall-Screen
      const bodyAfter = await page.locator('body').innerText()
      check('Nach Übernehmen zurück auf Home (FamilyPlate sichtbar)', bodyAfter.includes('FamilyPlate'))
      check('Nicht mehr auf Notfall-Screen', !bodyAfter.includes('Korrekturen übernehmen'))

      // DB-Check
      await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
      const { data: dbCheck } = await supabase.from('week_plans')
        .select('plan_data').eq('family_id', FAMILY_ID).limit(1).single()
      await supabase.auth.signOut()

      const plan = dbCheck?.plan_data ?? []
      const montagAbend = plan.find(e => e.tag === 'Montag' && e.slot === 'Abend')
      check('Montag-Abend in DB vorhanden', !!montagAbend)
      check(`Montag-Abend geändert (nicht mehr "${ORIG_MONTAG_ABEND}")`, montagAbend?.gericht !== ORIG_MONTAG_ABEND)
      check('Dienstag-Abend unverändert geblieben', plan.some(e => e.tag === 'Dienstag' && e.slot === 'Abend' && e.gericht === ORIG_DIENSTAG_ABEND))
    }
  }

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: Notfall-Button auch in der Wochenansicht
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] Notfall-Button auch in Wochenansicht sichtbar')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)

  // Zur Wochenansicht navigieren
  await page.locator('button, a').filter({ hasText: /Ganze Woche ansehen/i }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '06-week-view')

  const body = await page.locator('body').innerText()
  check('Wochenansicht geöffnet (Wochenplan sichtbar)', body.includes('Wochenplan'))
  check('Notfall-Button in Wochenansicht sichtbar', body.includes('Mahlzeiten kurzfristig ändern'))

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
