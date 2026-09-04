/**
 * Testet den Unverträglichkeits-Mechanismus gegen die Live-App:
 * Phase 1 — Sabine Nüsse (bereits im echten Profil)
 * Phase 2 — Heiko Laktose (temporär hinzugefügt, danach wiederhergestellt)
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

// ─────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────
async function resetWeekPlan() {
  const { count } = await supabase.from('week_plans').delete({ count: 'exact' }).eq('family_id', 'flechner')
  console.log(`  Supabase: ${count ?? 0} week_plans-Zeile(n) gelöscht`)
}

async function getProfile() {
  const { data } = await supabase.from('family_profiles').select('members').eq('family_id', 'flechner').single()
  return data?.members ?? []
}

async function setHeikoProfil(allergien) {
  const members = await getProfile()
  const updated = members.map(m => m.id === 'PA' ? { ...m, allergien } : m)
  await supabase.from('family_profiles').upsert(
    { family_id: 'flechner', members: updated, onboarding_done: true, updated_at: new Date().toISOString() },
    { onConflict: 'family_id' }
  )
}

const browser = await chromium.launch({ headless: true })

async function runPhase(page, label, prefix) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`PHASE: ${label}`)
  console.log('═'.repeat(60))

  // ── Login ──────────────────────────────────────────────────
  await page.goto(BASE)
  await page.waitForSelector('input[type="password"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(600)
  await page.locator('text=Heiko').click().catch(() => {})
  await page.waitForTimeout(400)
  const pw = page.locator('input[type="password"]')
  if (await pw.count() > 0) await pw.fill(HEIKO_PW)
  await page.locator('button').filter({ hasText: /anmeld/i }).click().catch(() => {})
  await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  console.log('  ✓ Heiko eingeloggt')

  // ── Wochenplan generieren (Rémy) ───────────────────────────
  await page.locator('button').filter({ hasText: /^Woche$/i }).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${prefix}-01-home.png` })

  const planenBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
  if (await planenBtn.count() === 0) {
    console.log('  KEIN "Woche planen"-Button — ggf. Plan bereits vorhanden')
    await page.screenshot({ path: `${prefix}-01b-kein-planen.png` })
    return { badgeCount: -1, ersatzItems: -1 }
  }
  await planenBtn.click()
  await page.waitForTimeout(800)

  const remyBtn = page.locator('button').filter({ hasText: /rémy schlägt vor|schlägt vor/i }).first()
  if (await remyBtn.count() === 0) {
    console.log('  KEIN Rémy-Button')
    await page.screenshot({ path: `${prefix}-01c-kein-remy.png` })
    return { badgeCount: -1, ersatzItems: -1 }
  }
  await remyBtn.click()
  console.log('  Rémy schlägt vor — warte bis zu 90s...')
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some(b => /übernehmen/i.test(b.textContent ?? '')),
    { timeout: 90000 }
  ).catch(() => console.log('  Timeout: "Plan übernehmen" nicht erschienen'))
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${prefix}-02-plan-generiert.png` })

  // Plan übernehmen
  for (let i = 0; i < 12; i++) {
    const btn = page.locator('button').filter({ hasText: /plan übernehmen|übernehmen/i }).first()
    if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(3000); break }
    await page.evaluate(() => window.scrollBy(0, 250)); await page.waitForTimeout(400)
  }
  console.log('  ✓ Plan übernommen')

  // Ganze Woche ansehen
  const ganzeWocheBtn = page.locator('button, a').filter({ hasText: /ganze woche/i }).first()
  if (await ganzeWocheBtn.count() > 0) { await ganzeWocheBtn.click(); await page.waitForTimeout(1500) }
  await page.screenshot({ path: `${prefix}-03-wochenansicht.png` })

  // ── Badge-Check: rotes !-Badge (WocheScreen) ────────────────
  // Durch komplette Woche scrollen und Badges zählen
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)

  let badgeCount = 0
  const badgeTitles = []
  // Badge ist ein <span> mit Text "!" und rotem Hintergrund (#EF4444)
  // Wir suchen alle solchen Spans; title-Attribut enthält die ersetzteZutaten
  for (let scroll = 0; scroll < 8; scroll++) {
    const spans = page.locator('span').filter({ hasText: /^!$/ })
    const count = await spans.count()
    for (let i = 0; i < count; i++) {
      const title = await spans.nth(i).getAttribute('title').catch(() => '')
      if (title && !badgeTitles.includes(title)) badgeTitles.push(title)
    }
    badgeCount = Math.max(badgeCount, count)
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(200)
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  const spansBottom = page.locator('span').filter({ hasText: /^!$/ })
  badgeCount = Math.max(badgeCount, await spansBottom.count())
  for (let i = 0; i < await spansBottom.count(); i++) {
    const title = await spansBottom.nth(i).getAttribute('title').catch(() => '')
    if (title && !badgeTitles.includes(title)) badgeTitles.push(title)
  }

  await page.screenshot({ path: `${prefix}-04-scroll-unten.png` })
  console.log(`  Rote !-Badges gefunden: ${badgeCount}`)
  if (badgeTitles.length > 0) console.log(`  Badge-Inhalte (ersetzteZutaten): ${badgeTitles.join(' | ')}`)

  // ── Als Wochenchef bestätigen (für Einkaufslisten-Test) ────
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  for (let i = 0; i < 12; i++) {
    const btn = page.locator('button').filter({ hasText: /wochenchef bestätig|als wochenchef/i }).first()
    if (await btn.count() > 0) {
      await btn.scrollIntoViewIfNeeded()
      await btn.click()
      console.log('  ✓ Als Wochenchef bestätigt')
      await page.waitForTimeout(5000)
      break
    }
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: `${prefix}-05-bestaetigt.png` })

  // ── Einkaufsliste generieren (EinkaufScreen) ───────────────
  await page.locator('button').filter({ hasText: /Einkauf/i }).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${prefix}-06-einkauf-leer.png` })

  // "Liste generieren" klicken → Day-Picker öffnet sich
  const genBtn = page.locator('button').filter({ hasText: /liste generieren/i }).first()
  if (await genBtn.count() > 0) {
    await genBtn.click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${prefix}-07-day-picker.png` })

    // "Liste erstellen" bestätigen (alle Tage ausgewählt als Default)
    const erstellenBtn = page.locator('button').filter({ hasText: /liste erstellen/i }).first()
    if (await erstellenBtn.count() > 0) {
      await erstellenBtn.click()
      await page.waitForTimeout(1500)
    }
  }
  await page.screenshot({ path: `${prefix}-08-einkaufsliste.png` })

  // Ersatz-Zutat-Items zählen (blau = color #2563EB)
  // Der Text einer Ersatz-Zutat enthält typisch "(für ...)"
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  let ersatzItems = 0
  const ersatzTexts = []
  for (let scroll = 0; scroll < 10; scroll++) {
    // "für" im Text (typisches Muster: "1 Packung glutenfreier Teig (für Heiko)")
    const fuerSpans = page.locator('div').filter({ hasText: /\(für [A-Za-z]+\)/i })
    const fuerCount = await fuerSpans.count()
    for (let i = 0; i < fuerCount; i++) {
      const txt = (await fuerSpans.nth(i).textContent().catch(() => '')).trim()
      if (txt && txt.length < 80 && !ersatzTexts.includes(txt)) ersatzTexts.push(txt)
    }
    ersatzItems = Math.max(ersatzItems, fuerCount)
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(200)
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${prefix}-09-einkauf-unten.png` })

  console.log(`  Ersatz-Zutat-Zeilen (mit "(für …)"): ${ersatzItems}`)
  if (ersatzTexts.length > 0) console.log(`  Ersatz-Texte: ${ersatzTexts.slice(0, 5).join(' | ')}`)

  // Logout
  await page.locator('button').filter({ hasText: /Profil/i }).first().click()
  await page.waitForTimeout(600)
  const logoutBtn = page.locator('button').filter({ hasText: /abmeld/i }).first()
  if (await logoutBtn.count() > 0) { await logoutBtn.click(); await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(500) }
  console.log('  ✓ Ausgeloggt')

  return { badgeCount, ersatzItems, badgeTitles, ersatzTexts }
}

// ─────────────────────────────────────────────────────────────
// Vor-Zustand lesen
// ─────────────────────────────────────────────────────────────
const profileVorher = await getProfile()
const heikoVorher = profileVorher.find(m => m.id === 'PA')
const sabineVorher = profileVorher.find(m => m.id === 'MA')
console.log('Profil VOR Test:')
console.log(`  Heiko Allergien: ${heikoVorher?.allergien?.join(', ') || '(keine)'}`)
console.log(`  Sabine Allergien: ${sabineVorher?.allergien?.join(', ') || '(keine)'}`)

// ─────────────────────────────────────────────────────────────
// PHASE 1: Sabine Nüsse (echtes Profil, kein Eingriff)
// ─────────────────────────────────────────────────────────────
await resetWeekPlan()
const page1 = await browser.newPage()
await page1.setViewportSize({ width: 390, height: 844 })

const phase1 = await runPhase(page1, 'Sabine — Nüsse-Unverträglichkeit (echtes Profil)', 'intoleranz-nuesse')
await page1.close()

// ─────────────────────────────────────────────────────────────
// PHASE 2: Heiko Laktose (temporär)
// ─────────────────────────────────────────────────────────────
console.log('\n  → Heiko: Laktose temporär hinzufügen...')
const heikoAltAllergien = [...(heikoVorher?.allergien ?? []), 'Laktose']
await setHeikoProfil(heikoAltAllergien)
const profileNach = await getProfile()
console.log(`  Heiko Allergien jetzt: ${profileNach.find(m => m.id === 'PA')?.allergien?.join(', ')}`)

await resetWeekPlan()
const page2 = await browser.newPage()
await page2.setViewportSize({ width: 390, height: 844 })

const phase2 = await runPhase(page2, 'Heiko — Laktose-Unverträglichkeit (temporär)', 'intoleranz-laktose')
await page2.close()

// ─────────────────────────────────────────────────────────────
// Aufräumen: Heiko-Profil wiederherstellen + Wochenplan löschen
// ─────────────────────────────────────────────────────────────
console.log('\n  → Heiko: Laktose wieder entfernen (Wiederherstellung)...')
await setHeikoProfil(heikoVorher?.allergien ?? [])
const profileRestored = await getProfile()
console.log(`  Heiko Allergien wiederhergestellt: ${profileRestored.find(m => m.id === 'PA')?.allergien?.join(', ') || '(keine)'}`)

await resetWeekPlan()
await supabase.auth.signOut()
await browser.close()

// ─────────────────────────────────────────────────────────────
// ERGEBNIS-ZUSAMMENFASSUNG
// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('ERGEBNIS')
console.log('═'.repeat(60))

function verdict(badgeCount, ersatzItems, label) {
  const badgeOk  = badgeCount > 0
  const ersatzOk = ersatzItems > 0
  const icon = (badgeOk && ersatzOk) ? '✅' : (badgeOk || ersatzOk) ? '⚠️ ' : '❌'
  console.log(`\n${icon} ${label}`)
  console.log(`   Rote !-Badges:        ${badgeCount > 0 ? `${badgeCount} — vorhanden ✓` : badgeCount === -1 ? 'nicht getestet' : '0 — FEHLT ✗'}`)
  console.log(`   Ersatz-Zutat (blau):  ${ersatzItems > 0 ? `${ersatzItems} — vorhanden ✓` : ersatzItems === -1 ? 'nicht getestet' : '0 — FEHLT ✗'}`)
}

verdict(phase1.badgeCount, phase1.ersatzItems, 'Phase 1: Sabine — Nüsse')
verdict(phase2.badgeCount, phase2.ersatzItems, 'Phase 2: Heiko — Laktose (temporär)')

const allOk = phase1.badgeCount > 0 && phase1.ersatzItems > 0 && phase2.badgeCount > 0 && phase2.ersatzItems > 0
console.log(`\n${'─'.repeat(60)}`)
console.log(allOk
  ? '✅ GESAMT-PASS: Mechanismus funktioniert bei beiden Unverträglichkeiten'
  : '❌ GESAMT-FAIL: Mindestens ein Fall zeigt keine Badges oder Ersatz-Zutaten')
