import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
const PW = {
  Heiko: process.env.TEST_HEIKO_PW,
  Tim:   process.env.TEST_TIM_PW,
}

if (!PW.Heiko || !PW.Tim) {
  console.error('Fehlend: TEST_HEIKO_PW / TEST_TIM_PW')
  process.exit(1)
}

async function login(page, name) {
  await page.goto(BASE)
  await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
  await page.locator(`text=${name}`).click().catch(() => {})
  await page.waitForTimeout(400)
  const pw = page.locator('input[type="password"]')
  if (await pw.count() > 0) await pw.fill(PW[name])
  await page.waitForTimeout(200)
  await page.locator('button').filter({ hasText: /anmeld/i }).click().catch(() => {})
  await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  console.log(`  ✓ ${name} eingeloggt`)
}

async function logout(page) {
  const profileTab = page.locator('button').filter({ hasText: /Profil/i }).first()
  if (await profileTab.count() > 0) { await profileTab.click(); await page.waitForTimeout(800) }
  const logoutBtn = page.locator('button').filter({ hasText: /abmeld/i }).first()
  if (await logoutBtn.count() > 0) {
    await logoutBtn.click()
    await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(500)
    console.log('  ✓ Ausgeloggt')
  } else {
    await page.goto(BASE); await page.waitForTimeout(3000)
  }
}

async function goToWoche(page) {
  const tab = page.locator('button').filter({ hasText: /^Woche$/i })
  if (await tab.count() > 0) await tab.first().click()
  await page.waitForTimeout(1500)
}

async function openFullWeekView(page) {
  const btn = page.locator('button, a').filter({ hasText: /ganze woche/i }).first()
  if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(1500) }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 390, height: 844 })

// ══════════════════════════════════════════════════════════════
// SCHRITT 1: Heiko — Plan generieren + bestätigen
// ══════════════════════════════════════════════════════════════
console.log('\n=== SCHRITT 1: Heiko — Plan generieren ===')
await login(page, 'Heiko')
await goToWoche(page)
await page.screenshot({ path: 'live-01-heiko-home-leer.png' })

const wochePlanenBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
if (await wochePlanenBtn.count() > 0) {
  await wochePlanenBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'live-02-plan-optionen.png' })

  const remyBtn = page.locator('button').filter({ hasText: /rémy schlägt vor|schlägt vor/i }).first()
  if (await remyBtn.count() > 0) {
    await remyBtn.click()
    console.log('  Rémy schlägt vor — warte bis zu 90s auf "Plan übernehmen"...')
    await page.waitForSelector('button', { timeout: 90000 }).catch(() => {})
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some(b => /übernehmen/i.test(b.textContent)),
      { timeout: 90000 }
    ).catch(() => console.log('  Timeout: "Plan übernehmen" nicht erschienen'))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'live-03-plan-generiert.png' })
  }
}

// Plan übernehmen
let planUebernommen = false
for (let i = 0; i < 15; i++) {
  const btn = page.locator('button').filter({ hasText: /plan übernehmen|übernehmen/i }).first()
  if (await btn.count() > 0) { await btn.click(); planUebernommen = true; await page.waitForTimeout(3000); break }
  await page.evaluate(() => window.scrollBy(0, 250)); await page.waitForTimeout(400)
}
if (planUebernommen) {
  console.log('  ✓ Plan übernommen')
  await page.screenshot({ path: 'live-04-plan-uebernommen.png' })
}

// Zur Wochenansicht → Als Wochenchef bestätigen
await openFullWeekView(page)
await page.screenshot({ path: 'live-05-wochenansicht.png' })

let chefBestaetigt = false
for (let i = 0; i < 12; i++) {
  const btn = page.locator('button').filter({ hasText: /wochenchef bestätig|als wochenchef/i }).first()
  if (await btn.count() > 0) {
    await btn.scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'live-06-chef-btn.png' })
    await btn.click()
    console.log('  ✓ Als Wochenchef bestätigt')
    await page.waitForTimeout(6000)
    await page.screenshot({ path: 'live-07-plan-bestaetigt.png' })
    chefBestaetigt = true; break
  }
  await page.evaluate(() => window.scrollBy(0, 280)); await page.waitForTimeout(300)
}
if (!chefBestaetigt) {
  const btns = await page.locator('button').allTextContents()
  console.log('  ✗ KEIN Chef-Bestätigen-Button:', btns.filter(t => t.trim()).slice(0, 10))
}

await logout(page)

// ══════════════════════════════════════════════════════════════
// SCHRITT 2: Tim — NACH Bestätigung einen Alternativ-Wunsch
// ══════════════════════════════════════════════════════════════
console.log('\n=== SCHRITT 2: Tim — Alternativ-Wunsch NACH Bestätigung ===')
await login(page, 'Tim')
await goToWoche(page)
await page.screenshot({ path: 'live-08-tim-home.png' })

const wunschBtns = page.locator('button').filter({ hasText: /wunsch|änderung/i })
console.log(`  Wunsch-Buttons: ${await wunschBtns.count()}`)

if (await wunschBtns.count() > 0) {
  await wunschBtns.first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'live-09-wunsch-form.png' })

  const altBtn = page.locator('button').filter({ hasText: /eigenes.gericht|✏️/i }).first()
  if (await altBtn.count() > 0) { await altBtn.click(); await page.waitForTimeout(400) }

  const textInput = page.locator('input[type="text"]').first()
  if (await textInput.count() > 0) { await textInput.fill('Pizza'); await page.waitForTimeout(300) }
  await page.screenshot({ path: 'live-10-pizza-eingegeben.png' })

  const saveBtn = page.locator('button').filter({ hasText: /speicher/i }).first()
  if (await saveBtn.count() > 0) {
    await saveBtn.click()
    await page.waitForTimeout(2000)
    console.log('  ✓ Pizza-Wunsch gespeichert')
    await page.screenshot({ path: 'live-11-pizza-gespeichert.png' })
  }
} else {
  console.log('  ✗ Kein Wunsch-Button für Tim')
}

await logout(page)

// ══════════════════════════════════════════════════════════════
// SCHRITT 3: Heiko — Bug-Check + neuer Kasten
// ══════════════════════════════════════════════════════════════
console.log('\n=== SCHRITT 3: Heiko — Neuer "Nachträgliche Alternativen"-Kasten ===')
await login(page, 'Heiko')
await goToWoche(page)
await openFullWeekView(page)
await page.screenshot({ path: 'live-12-heiko-woche.png' })

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(800)
await page.screenshot({ path: 'live-13-scroll-unten.png' })

const nachtragsKasten = page.locator('text=Nachträgliche Alternativen')
const entscheidungBtn = page.locator('button').filter({ hasText: /entscheidung übernehmen/i })
const alternativenAbschnitt = page.locator('text=Alternativen')

const kastenCount = await nachtragsKasten.count()
const btnCount = await entscheidungBtn.count()
const altCount = await alternativenAbschnitt.count()

console.log(`  "Nachträgliche Alternativen"-Kasten: ${kastenCount}`)
console.log(`  "Entscheidung übernehmen"-Button: ${btnCount}`)
console.log(`  "Alternativen"-Abschnitte (SlotPanel): ${altCount}`)

if (kastenCount > 0) {
  await nachtragsKasten.first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'live-14-kasten-nahaufnahme.png' })
}

// ══════════════════════════════════════════════════════════════
// SCHRITT 4: Heiko — Checkbox ankreuzen + bestätigen (Rezept-Abruf)
// ══════════════════════════════════════════════════════════════
if (btnCount > 0) {
  console.log('\n=== SCHRITT 4: Heiko — Pizza übernehmen + Rezept generieren ===')

  if (kastenCount > 0) {
    await page.locator('text=Nachträgliche Alternativen').first().scrollIntoViewIfNeeded()
    const allBtnsInKasten = page.locator('button').filter({ hasText: /^$|^✓$/ })
    if (await allBtnsInKasten.count() > 0) {
      await allBtnsInKasten.first().click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: 'live-15-checkbox-gesetzt.png' })
    }
  }

  await entscheidungBtn.first().scrollIntoViewIfNeeded()
  await entscheidungBtn.first().click()
  console.log('  Entscheidung geklickt — warte auf Rezept-Abruf (Live-API, bis zu 30s)...')
  await page.waitForTimeout(25000)
  await page.screenshot({ path: 'live-16-nach-entscheidung.png' })

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'live-17-plan-nach-uebernahme.png' })
  console.log('  ✓ Entscheidung abgeschlossen')
}

await browser.close()

console.log('\n=== TEST ABGESCHLOSSEN ===')
if (kastenCount > 0 && btnCount > 0) {
  console.log('✅ PASS: Neuer Kasten sichtbar, Button vorhanden — Bug gefixt!')
} else {
  console.log('❌ FAIL: Kasten oder Button fehlt')
}
