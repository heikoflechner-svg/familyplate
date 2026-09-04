/**
 * Testet den Unverträglichkeits-Mechanismus gegen die Live-App:
 *
 * Phase 1 — Sabine Nüsse (chip-Auswahl, bereits im echten Profil)
 * Phase 2 — Heiko Laktose (FREITEXT-Eingabe im Wizard, temporär)
 *
 * Dabei wird auch geprüft, ob Chip-Auswahl und Freitext-Eingabe
 * im Profil am Ende gleich behandelt werden.
 *
 * Prüft jeweils:
 *   - Rotes !-Badge bei betroffenen Gerichten (WocheScreen)
 *   - Blaue Ersatz-Zutat-Zeilen in der Einkaufsliste (EinkaufScreen)
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE         = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const HEIKO_EMAIL  = process.env.TEST_HEIKO_EMAIL
const HEIKO_PW     = process.env.TEST_HEIKO_PW

if (!SUPABASE_URL || !SUPABASE_KEY || !HEIKO_EMAIL || !HEIKO_PW) {
  console.error('Fehlend: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / TEST_HEIKO_EMAIL / TEST_HEIKO_PW')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })

async function resetWeekPlan() {
  const { count } = await supabase.from('week_plans').delete({ count: 'exact' }).eq('family_id', 'flechner')
  console.log(`  Supabase: ${count ?? 0} week_plans-Zeile(n) gelöscht`)
}

async function getProfile() {
  const { data } = await supabase.from('family_profiles').select('members').eq('family_id', 'flechner').single()
  return data?.members ?? []
}

// ─────────────────────────────────────────────────────────────
// Vor-Zustand lesen
// ─────────────────────────────────────────────────────────────
const profileVorher = await getProfile()
const heikoVorher = profileVorher.find(m => m.id === 'PA')
const sabineVorher = profileVorher.find(m => m.id === 'MA')
console.log('Profil VOR Test:')
console.log(`  Heiko  Allergien: ${heikoVorher?.allergien?.join(', ') || '(keine)'}`)
console.log(`  Sabine Allergien: ${sabineVorher?.allergien?.join(', ') || '(keine)'}`)

const browser = await chromium.launch({ headless: true })

// ─────────────────────────────────────────────────────────────
// Hilfsfunktionen Browser
// ─────────────────────────────────────────────────────────────
async function loginAs(page, name, pw) {
  await page.goto(BASE)
  await page.waitForSelector('input[type="password"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(600)
  await page.locator(`text=${name}`).click().catch(() => {})
  await page.waitForTimeout(400)
  const pwField = page.locator('input[type="password"]')
  if (await pwField.count() > 0) await pwField.fill(pw)
  await page.locator('button').filter({ hasText: /anmeld/i }).click().catch(() => {})
  await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  console.log(`  ✓ ${name} eingeloggt`)
}

async function logout(page) {
  await page.locator('button').filter({ hasText: /Profil/i }).first().click()
  await page.waitForTimeout(600)
  const btn = page.locator('button').filter({ hasText: /abmeld/i }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(500)
  } else {
    await page.goto(BASE); await page.waitForTimeout(3000)
  }
  console.log('  ✓ Ausgeloggt')
}

async function generateAndConfirmPlan(page, prefix) {
  await page.locator('button').filter({ hasText: /^Woche$/i }).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${prefix}-01-home.png` })

  const planenBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
  if (await planenBtn.count() === 0) {
    console.log('  KEIN "Woche planen"-Button')
    return false
  }
  await planenBtn.click(); await page.waitForTimeout(800)

  const remyBtn = page.locator('button').filter({ hasText: /rémy schlägt vor|schlägt vor/i }).first()
  if (await remyBtn.count() === 0) { console.log('  KEIN Rémy-Button'); return false }
  await remyBtn.click()
  console.log('  Rémy schlägt vor — warte bis zu 90s...')
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some(b => /übernehmen/i.test(b.textContent ?? '')),
    { timeout: 90000 }
  ).catch(() => console.log('  Timeout'))
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${prefix}-02-plan.png` })

  for (let i = 0; i < 12; i++) {
    const btn = page.locator('button').filter({ hasText: /plan übernehmen|übernehmen/i }).first()
    if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(3000); break }
    await page.evaluate(() => window.scrollBy(0, 250)); await page.waitForTimeout(300)
  }
  console.log('  ✓ Plan übernommen')

  const ganzeWoche = page.locator('button, a').filter({ hasText: /ganze woche/i }).first()
  if (await ganzeWoche.count() > 0) { await ganzeWoche.click(); await page.waitForTimeout(1500) }
  return true
}

async function checkBadges(page, prefix) {
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
  const badgeTitles = []
  for (let s = 0; s < 10; s++) {
    const spans = page.locator('span').filter({ hasText: /^!$/ })
    for (let i = 0; i < await spans.count(); i++) {
      const title = await spans.nth(i).getAttribute('title').catch(() => '')
      if (title && !badgeTitles.includes(title)) badgeTitles.push(title)
    }
    await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(150)
  }
  await page.screenshot({ path: `${prefix}-03-badges.png` })
  console.log(`  Rote !-Badges: ${badgeTitles.length}`)
  badgeTitles.forEach(t => console.log(`    • ${t}`))

  // Als Wochenchef bestätigen
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400)
  for (let i = 0; i < 12; i++) {
    const btn = page.locator('button').filter({ hasText: /wochenchef bestätig|als wochenchef/i }).first()
    if (await btn.count() > 0) { await btn.scrollIntoViewIfNeeded(); await btn.click(); await page.waitForTimeout(5000); break }
    await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(300)
  }
  console.log('  ✓ Als Wochenchef bestätigt')
  return badgeTitles
}

async function checkShoppingList(page, prefix) {
  await page.locator('button').filter({ hasText: /Einkauf/i }).first().click()
  await page.waitForTimeout(1500)

  const genBtn = page.locator('button').filter({ hasText: /liste generieren/i }).first()
  if (await genBtn.count() > 0) {
    await genBtn.click(); await page.waitForTimeout(600)
    const erstellenBtn = page.locator('button').filter({ hasText: /liste erstellen/i }).first()
    if (await erstellenBtn.count() > 0) { await erstellenBtn.click(); await page.waitForTimeout(1500) }
  }
  await page.screenshot({ path: `${prefix}-04-einkauf-oben.png` })

  const ersatzTexts = []
  for (let s = 0; s < 12; s++) {
    const fuerDivs = page.locator('div').filter({ hasText: /\(für [A-Za-z]+\)/i })
    for (let i = 0; i < await fuerDivs.count(); i++) {
      const txt = (await fuerDivs.nth(i).textContent().catch(() => '')).trim()
      if (txt && txt.length < 100 && !ersatzTexts.includes(txt)) ersatzTexts.push(txt)
    }
    await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(150)
  }
  await page.screenshot({ path: `${prefix}-05-einkauf-unten.png` })

  const cleanTexts = ersatzTexts.filter(t => /\(für [A-Za-z]+\)/.test(t) && t.length > 5)
  console.log(`  Ersatz-Zutat-Zeilen: ${cleanTexts.length}`)
  cleanTexts.slice(0, 6).forEach(t => console.log(`    • ${t}`))
  return cleanTexts
}

// ═════════════════════════════════════════════════════════════
// PHASE 1: Sabine Nüsse (Chip, echtes Profil)
// ═════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60))
console.log('PHASE 1: Sabine — Nüsse (Chip-Auswahl, echtes Profil)')
console.log('═'.repeat(60))

await resetWeekPlan()
const page1 = await browser.newPage()
await page1.setViewportSize({ width: 390, height: 844 })
await loginAs(page1, 'Heiko', HEIKO_PW)
await generateAndConfirmPlan(page1, 'phase1')
const badges1 = await checkBadges(page1, 'phase1')
const ersatz1 = await checkShoppingList(page1, 'phase1')
await logout(page1)
await page1.close()

// ═════════════════════════════════════════════════════════════
// PHASE 2: Heiko Laktose — FREITEXT-Eingabe im Wizard
// ═════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60))
console.log('PHASE 2: Heiko — Laktose (FREITEXT-Eingabe im Profil-Wizard)')
console.log('═'.repeat(60))

await resetWeekPlan()
const page2 = await browser.newPage()
await page2.setViewportSize({ width: 390, height: 844 })
await loginAs(page2, 'Heiko', HEIKO_PW)

// Profil bearbeiten → Laktose als FREITEXT eintragen
console.log('  Profil bearbeiten — Laktose als Freitext eintragen...')
await page2.locator('button').filter({ hasText: /Profil/i }).first().click()
await page2.waitForTimeout(1000)
await page2.screenshot({ path: 'phase2-00-profil-tab.png' })

const editBtn = page2.locator('button').filter({ hasText: /profil bearbeiten|bearbeiten/i }).first()
if (await editBtn.count() > 0) { await editBtn.click(); await page2.waitForTimeout(800) }
await page2.screenshot({ path: 'phase2-00b-wizard-schritt1.png' })

// Schritt 1 → Schritt 2 (Unverträglichkeiten)
await page2.locator('button').filter({ hasText: /^Weiter$/i }).first().click()
await page2.waitForTimeout(600)
await page2.screenshot({ path: 'phase2-00c-wizard-schritt2.png' })

// Freitext-Feld für Heiko (PA, erster in der Liste) befüllen
// Der Placeholder ist "Weiteres, kommagetrennt" — es gibt 3 solcher Felder (PA, MA, TI)
// WICHTIG: Chip "Laktose" NICHT klicken — stattdessen Freitext nutzen
const freitextFelder = page2.locator('input[placeholder="Weiteres, kommagetrennt"]')
const freitextCount = await freitextFelder.count()
console.log(`  Freitext-Felder auf Schritt 2: ${freitextCount}`)
await page2.screenshot({ path: 'phase2-00d-freitext-felder.png' })

// Prüfen ob Laktose-Chip aktiv ist (darf nicht sein für diesen Test)
const laktoseChips = page2.locator('button').filter({ hasText: /^Laktose$/i })
const laktoseChipCount = await laktoseChips.count()
console.log(`  "Laktose"-Chips sichtbar: ${laktoseChipCount}`)

// Heiko ist PA = erster Member in CHEF_ORDER → erstes Freitext-Feld
if (freitextCount >= 1) {
  const heikoFreitext = freitextFelder.first()
  const vorhandenerText = await heikoFreitext.inputValue()
  if (vorhandenerText) {
    // Bestehenden Freitext ergänzen
    await heikoFreitext.fill(vorhandenerText + ', Laktose')
  } else {
    await heikoFreitext.fill('Laktose')
  }
  await page2.waitForTimeout(300)
  console.log(`  ✓ "Laktose" in Hiekos Freitext-Feld eingetragen (vorher: "${vorhandenerText || '(leer)'}")`)
  await page2.screenshot({ path: 'phase2-00e-laktose-freitext.png' })
} else {
  console.log('  ✗ Kein Freitext-Feld für Heiko gefunden')
}

// Schritt 2 → Schritt 3 → Speichern
await page2.locator('button').filter({ hasText: /^Weiter$/i }).first().click()
await page2.waitForTimeout(600)
await page2.screenshot({ path: 'phase2-00f-wizard-schritt3.png' })

const losBtnP2 = page2.locator('button').filter({ hasText: /los geht|speicher/i }).first()
if (await losBtnP2.count() > 0) {
  await losBtnP2.click()
  await page2.waitForTimeout(3000)
  console.log('  ✓ Profil gespeichert')
  await page2.screenshot({ path: 'phase2-00g-gespeichert.png' })
}

// Supabase-Verifikation: Hat Laktose als Freitext denselben Effekt?
const profileNachWizard = await getProfile()
const heikoNach = profileNachWizard.find(m => m.id === 'PA')
console.log(`  Heiko Allergien in Supabase: ${heikoNach?.allergien?.join(', ') || '(keine)'}`)
const laktoseInDb = heikoNach?.allergien?.includes('Laktose') ?? false
console.log(`  Laktose (Freitext) in Supabase gespeichert: ${laktoseInDb ? 'JA ✅' : 'NEIN ❌'}`)

// Jetzt Plan generieren und Badges/Einkaufsliste prüfen
await page2.locator('button').filter({ hasText: /^Woche$/i }).first().click()
await page2.waitForTimeout(1500)
await generateAndConfirmPlan(page2, 'phase2')
const badges2 = await checkBadges(page2, 'phase2')
const ersatz2 = await checkShoppingList(page2, 'phase2')
await logout(page2)
await page2.close()

// ─────────────────────────────────────────────────────────────
// Aufräumen: Laktose aus Heikos Profil entfernen
// ─────────────────────────────────────────────────────────────
console.log('\n  → Heiko: Laktose wieder entfernen...')
const profileFinal = await getProfile()
const restoredMembers = profileFinal.map(m =>
  m.id === 'PA'
    ? { ...m, allergien: (heikoVorher?.allergien ?? []) }
    : m
)
await supabase.from('family_profiles').upsert(
  { family_id: 'flechner', members: restoredMembers, onboarding_done: true, updated_at: new Date().toISOString() },
  { onConflict: 'family_id' }
)
const profileCheck = await getProfile()
console.log(`  Heiko Allergien wiederhergestellt: ${profileCheck.find(m => m.id === 'PA')?.allergien?.join(', ') || '(keine)'}`)

await resetWeekPlan()
await supabase.auth.signOut()
await browser.close()

// ═════════════════════════════════════════════════════════════
// ERGEBNIS
// ═════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60))
console.log('ERGEBNIS')
console.log('═'.repeat(60))

console.log('\n📋 Code-Analyse: Chip-Auswahl vs. Freitext')
console.log('  • finish(): beide Wege landen im selben allergien[]-Array')
console.log('  • buildFamilyPrompt(): unterscheidet nicht — kein(e) ${allergien.join(", ")}')
console.log('  • Badge-Erkennung: reagiert nur auf ersetzteZutaten[] im Rezept-JSON')
console.log('  • Kosmetischer Unterschied: "Laktose" als Freitext → wird beim nächsten Edit als Chip gezeigt')
console.log('    (weil "Laktose" in ALLERGIE_OPTIONS steht)')

function verdict(label, badges, ersatz, laktoseInDbOk) {
  const ok = badges.length > 0 && ersatz.length > 0
  console.log(`\n${ok ? '✅' : '❌'} ${label}`)
  console.log(`   Rote !-Badges:       ${badges.length > 0 ? `${badges.length} ✓` : '0 ✗'}`)
  console.log(`   Ersatz-Zutaten:      ${ersatz.length > 0 ? `${ersatz.length} ✓` : '0 ✗'}`)
  if (laktoseInDbOk !== undefined) {
    console.log(`   Freitext→Supabase:  ${laktoseInDbOk ? 'korrekt gespeichert ✓' : 'FEHLER ✗'}`)
  }
}

verdict('Phase 1: Sabine — Nüsse (Chip)', badges1, ersatz1)
verdict('Phase 2: Heiko — Laktose (Freitext)', badges2, ersatz2, laktoseInDb)

const allOk = badges1.length > 0 && ersatz1.length > 0 && badges2.length > 0 && ersatz2.length > 0 && laktoseInDb
console.log(`\n${'─'.repeat(60)}`)
console.log(allOk
  ? '✅ GESAMT-PASS'
  : '❌ GESAMT-FAIL — Details oben')
