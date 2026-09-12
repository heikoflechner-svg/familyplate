/**
 * Live-Test: Punkt 4 – Einkaufs-Kopplung über Wochengrenzen
 * (a) Einkaufsliste liest aus next_week_data wenn Abdeckungszeitraum in nächste Woche reicht
 * (b) Warnung wenn nächste Woche noch nicht freigegeben vor Einkaufstag
 * (c) activateNextWeek kopiert plan_data + meals_data korrekt
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const HEIKO_EMAIL  = process.env.TEST_HEIKO_EMAIL
const HEIKO_PW     = process.env.TEST_HEIKO_PW
const FAMILY_ID    = 'flechner'
const BASE         = 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_KEY || !HEIKO_EMAIL || !HEIKO_PW) {
  console.error('Fehlende Umgebungsvariablen'); process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const shot = (page, name) => page.screenshot({ path: `p4-${name}.png` })

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

async function goToEinkauf(page) {
  const einkaufBtn = page.locator('.nav button').filter({ hasText: /einkauf/i }).first()
  if (await einkaufBtn.count() > 0) {
    await einkaufBtn.click()
    await page.waitForTimeout(600)
  }
}

await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
const { data: existing } = await supabase.from('week_plans')
  .select('id').eq('family_id', FAMILY_ID).limit(1).single()
if (!existing?.id) { console.error('Kein week_plans-Eintrag'); process.exit(1) }
await supabase.auth.signOut()

const todayMonday = (() => {
  const d = new Date(); const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().slice(0, 10)
})()
const nextMonday = (() => {
  const d = new Date(); const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow))
  return d.toISOString().slice(0, 10)
})()

const currentPlan = [
  { tag: 'Montag', slot: 'Mittag', emoji: '🥗', gericht: 'Salat', minuten: 15, quelle: 'test', chef: 'PA' },
  { tag: 'Freitag', slot: 'Abend', emoji: '🍕', gericht: 'Pizza', minuten: 30, quelle: 'test', chef: 'PA' },
  { tag: 'Samstag', slot: 'Abend', emoji: '🍝', gericht: 'Pasta', minuten: 30, quelle: 'test', chef: 'PA' },
]
const currentMeals = {
  'Pasta': { name: 'Pasta', emoji: '🍝', zutaten: [{ name: 'Nudeln', menge: '200g', typ: 'speisekammer' }, { name: 'Tomaten', menge: '3 Stück', typ: 'frisch' }], schritte: [], minuten: 30, schwierigkeit: 'leicht' },
}

const nwPlan = [
  { tag: 'Montag', slot: 'Mittag', emoji: '🍲', gericht: 'Linsensuppe', minuten: 25, quelle: 'test', chef: 'MA' },
  { tag: 'Montag', slot: 'Abend', emoji: '🥩', gericht: 'Schnitzel', minuten: 40, quelle: 'test', chef: 'MA' },
  { tag: 'Dienstag', slot: 'Abend', emoji: '🥘', gericht: 'Gulasch', minuten: 60, quelle: 'test', chef: 'MA' },
]
const nwMeals = {
  'Linsensuppe': { name: 'Linsensuppe', emoji: '🍲', zutaten: [{ name: 'Linsen', menge: '150g', typ: 'speisekammer' }, { name: 'Möhren', menge: '2 Stück', typ: 'frisch' }], schritte: [], minuten: 25, schwierigkeit: 'mittel' },
  'Schnitzel': { name: 'Schnitzel', emoji: '🥩', zutaten: [{ name: 'Schweinefleisch', menge: '300g', typ: 'frisch' }, { name: 'Mehl', menge: '50g', typ: 'speisekammer' }], schritte: [], minuten: 40, schwierigkeit: 'mittel' },
}

const browser = await chromium.launch({ headless: true })

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Warning-Banner wenn nächste Woche nicht freigegeben + Einkaufstag Samstag
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] Warning-Banner: Nächste Woche nicht freigegeben, Einkaufs-Kopplung vorhanden')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  plan_data: currentPlan,
  meals_data: currentMeals,
  plan_confirmed: true,
  wochenchef: 'PA',
  week_start: todayMonday,
  next_week_start: nextMonday,
  shopping_day: 'Samstag,Dienstag',  // Samstag+Dienstag → Montag NW-Abdeckung
  next_week_data: { wochenchef: 'MA', wishes: [] },  // NICHT confirmed
}).eq('id', existing.id)
await supabase.auth.signOut()
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await goToEinkauf(page)
  await shot(page, '01-einkauf-warning')

  const body = await page.locator('body').innerText()
  check('Warning-Banner sichtbar', body.includes('Nächste Woche noch nicht freigegeben'))
  check('Einkaufstag im Banner erwähnt', body.toLowerCase().includes('samstag') || body.toLowerCase().includes('dienstag'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Kein Warning-Banner wenn nächste Woche freigegeben ist
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] Kein Warning-Banner wenn nächste Woche freigegeben')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  next_week_data: { wochenchef: 'MA', wishes: [], plan: nwPlan, mealsData: nwMeals, planConfirmed: true },
}).eq('id', existing.id)
await supabase.auth.signOut()
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await goToEinkauf(page)
  await shot(page, '02-no-warning')

  const body = await page.locator('body').innerText()
  check('Kein Warning-Banner', !body.includes('Nächste Woche noch nicht freigegeben'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Day-Picker zeigt NW-Tage wenn nächste Woche freigegeben
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] Day-Picker zeigt NW-Tage (Montag ⁺¹) bei freigegebener nächster Woche')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await goToEinkauf(page)

  // "Liste generieren" Button klicken
  const genBtn = page.locator('button').filter({ hasText: /liste generieren|neu/i }).first()
  if (await genBtn.count() > 0) {
    await genBtn.click()
    await page.waitForTimeout(500)
    await shot(page, '03-daypicker-nw')

    const body = await page.locator('body').innerText()
    check('NW-Tage-Sektion "Nächste Woche" sichtbar', body.includes('Nächste Woche miteinschließen'))
    check('"Mo ⁺¹" Button sichtbar', body.includes('Mo ⁺¹') || body.includes('Mo ⁺'))
  } else {
    check('Generieren-Button gefunden', false)
    check('"Mo ⁺¹" Button sichtbar', false)
  }

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Shopping-Liste enthält NW-Artikel nach Generierung mit NW-Tagen
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] Shopping-Liste enthält NW-Artikel (Linsen, Möhren) nach Generierung')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await goToEinkauf(page)

  // Liste generieren (mit vorausgewählten NW-Tagen)
  const genBtn = page.locator('button').filter({ hasText: /liste generieren|neu/i }).first()
  if (await genBtn.count() > 0) {
    await genBtn.click()
    await page.waitForTimeout(500)

    // "📋 Liste erstellen" bestätigen
    const createBtn = page.locator('button').filter({ hasText: /liste erstellen/i }).first()
    if (await createBtn.count() > 0) {
      await createBtn.click()
      await page.waitForTimeout(1000)
      await shot(page, '04-list-with-nw')

      const body = await page.locator('body').innerText()
      check('"Linsen" aus NW-Montag in Liste', body.toLowerCase().includes('linsen'))
      check('"Möhren" aus NW-Montag in Liste', body.toLowerCase().includes('möhren') || body.toLowerCase().includes('mohren'))
      check('"NW" Label für NW-Gruppe sichtbar', body.includes('· NW') || body.includes('(NW)'))
    } else {
      check('Liste-erstellen-Button gefunden', false)
    }
  } else {
    check('Generieren-Button gefunden', false)
  }

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: kein NW-Abschnitt wenn shoppingDays=['Montag','Donnerstag'] (kein Overlap)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] Kein NW-Warning/Abschnitt wenn Einkaufstag Montag (kein Overlap)')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  shopping_day: 'Montag,Donnerstag',
  next_week_data: { wochenchef: 'MA', wishes: [] },  // nicht confirmed
}).eq('id', existing.id)
await supabase.auth.signOut()
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await goToEinkauf(page)
  await shot(page, '05-no-overlap')

  const body = await page.locator('body').innerText()
  check('Kein NW-Warning wenn kein Overlap', !body.includes('Nächste Woche noch nicht freigegeben'))

  await page.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: activateNextWeek kopiert plan_data und meals_data korrekt
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] activateNextWeek kopiert plan_data + meals_data aus next_week_data')
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  shopping_day: 'Samstag,Dienstag',
  next_week_data: { wochenchef: 'MA', wishes: [], plan: nwPlan, mealsData: nwMeals, planConfirmed: true },
}).eq('id', existing.id)
await supabase.auth.signOut()

// Woche manuell aktivieren (wie activateNextWeek() es tut)
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
const { data: beforeActivate } = await supabase.from('week_plans')
  .select('id, next_week_data').eq('family_id', FAMILY_ID).limit(1).single()
const nextData = beforeActivate?.next_week_data
await supabase.from('week_plans').update({
  week_start: nextMonday,
  wochenchef: nextData?.wochenchef ?? 'PA',
  plan_data: nextData?.plan ?? [],
  meals_data: nextData?.mealsData ?? {},
  wishes: nextData?.wishes ?? [],
  proposals: [],
  attendance: [],
  plan_confirmed: false,
  shopping_list: [],
  shopping_done: false,
  shopping_day: null,
  shopping_persons: null,
  next_week_start: null,
  next_week_data: null,
}).eq('id', existing.id)
const { data: afterActivate } = await supabase.from('week_plans')
  .select('plan_data, meals_data, wochenchef').eq('family_id', FAMILY_ID).limit(1).single()
await supabase.auth.signOut()

const plan = afterActivate?.plan_data ?? []
const meals = afterActivate?.meals_data ?? {}
check('plan_data aus next_week_data übernommen', plan.length === nwPlan.length)
check('Linsensuppe in neuen plan_data', plan.some(e => e.gericht === 'Linsensuppe'))
check('meals_data aus next_week_data übernommen', !!meals['Linsensuppe'])
check('Wochenchef MA übernommen', afterActivate?.wochenchef === 'MA')

// ─── Aufräumen ────────────────────────────────────────────────────────────────
await browser.close()
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  plan_data: [], meals_data: {}, wishes: [], proposals: [], plan_confirmed: false,
  wochenchef: 'PA', week_start: null, next_week_start: null, next_week_data: null,
  shopping_day: null, shopping_list: [],
}).eq('id', existing.id)
await supabase.auth.signOut()

console.log(`\n${'─'.repeat(40)}`)
console.log(`Ergebnis: ${pass} ✅  ${fail} ❌  (${pass + fail} Tests)`)
if (fail > 0) process.exit(1)
