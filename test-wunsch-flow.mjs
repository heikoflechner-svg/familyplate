import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const PW_BY_NAME = {
  Heiko:  process.env.TEST_HEIKO_PW,
  Tim:    process.env.TEST_TIM_PW,
  Sabine: process.env.TEST_SABINE_PW,
}

if (!PW_BY_NAME.Heiko || !PW_BY_NAME.Tim || !PW_BY_NAME.Sabine) {
  console.error('Fehlend: TEST_HEIKO_PW / TEST_TIM_PW / TEST_SABINE_PW')
  process.exit(1)
}

async function login(page, name) {
  await page.goto(BASE)
  await page.waitForSelector('input[type="password"], text=Wer bist du', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.locator(`text=${name}`).click().catch(() => {})
  await page.waitForTimeout(400)
  const pw = page.locator('input[type="password"]')
  if (await pw.count() > 0) await pw.fill(PW_BY_NAME[name])
  await page.waitForTimeout(200)
  await page.locator('button').filter({ hasText: /anmeld/i }).click().catch(() => {})
  await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  console.log(`  -> ${name} eingeloggt`)
}

async function logout(page) {
  const profileTab = page.locator('button').filter({ hasText: /Profil/i }).first()
  if (await profileTab.count() > 0) {
    await profileTab.click()
    await page.waitForTimeout(800)
  }
  const logoutBtn = page.locator('button').filter({ hasText: /abmeld/i }).first()
  if (await logoutBtn.count() > 0) {
    await logoutBtn.click()
    await page.waitForSelector('input[type="password"], text=Wer bist du', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(500)
    console.log('  -> Ausgeloggt')
  } else {
    await page.goto(BASE)
    await page.waitForTimeout(2000)
    console.log('  -> Logout via Navigation')
  }
}

async function goToWoche(page) {
  const tab = page.locator('button').filter({ hasText: /^Woche$/i })
  if (await tab.count() > 0) await tab.first().click()
  await page.waitForTimeout(1500)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 390, height: 844 })

// ──────────────────────────────────────────────────────────────
// SCHRITT 1: Heiko — Plan generieren
// ──────────────────────────────────────────────────────────────
console.log('\n=== SCHRITT 1: Heiko — Plan generieren ===')
await login(page, 'Heiko')
await goToWoche(page)
await page.screenshot({ path: 'wf-01-heiko-home.png' })

const wochePlanenBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
if (await wochePlanenBtn.count() > 0) {
  await wochePlanenBtn.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'wf-02-plan-optionen.png' })

  const remyVorBtn = page.locator('button').filter({ hasText: /rémy schlägt vor|schlägt vor/i }).first()
  if (await remyVorBtn.count() > 0) {
    await remyVorBtn.click()
    console.log('  Rémy schlägt vor — geklickt, warte bis zu 30s...')
    await page.waitForTimeout(28000)
    await page.screenshot({ path: 'wf-03-plan-generiert.png' })
  } else {
    console.log('  KEIN "Rémy schlägt vor"-Button gefunden!')
    await page.screenshot({ path: 'wf-02b-kein-remy-btn.png' })
  }
} else {
  console.log('  KEIN "Woche planen"-Button gefunden!')
  await page.screenshot({ path: 'wf-01b-kein-planen-btn.png' })
}

// ──────────────────────────────────────────────────────────────
// SCHRITT 2: Heiko — "Plan übernehmen" + "Als Wochenchef bestätigen"
// ──────────────────────────────────────────────────────────────
console.log('\n=== SCHRITT 2: Heiko — Plan bestätigen (2 Stufen) ===')

let planUebernehmenClicked = false
for (let i = 0; i < 8; i++) {
  const btn = page.locator('button').filter({ hasText: /plan übernehmen|übernehmen/i }).first()
  if (await btn.count() > 0) {
    await page.screenshot({ path: 'wf-04-plan-uebernehmen.png' })
    await btn.click()
    console.log('  "Plan übernehmen" geklickt')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'wf-05-nach-uebernehmen.png' })
    planUebernehmenClicked = true
    break
  }
  await page.evaluate(() => window.scrollBy(0, 250))
  await page.waitForTimeout(300)
}
if (!planUebernehmenClicked) {
  console.log('  KEIN "Plan übernehmen"-Button gefunden!')
  await page.screenshot({ path: 'wf-04-kein-uebernehmen.png' })
}

const ganzeWocheBtn = page.locator('button, a').filter({ hasText: /ganze woche/i }).first()
if (await ganzeWocheBtn.count() > 0) {
  await ganzeWocheBtn.click()
  console.log('  "Ganze Woche ansehen" geklickt')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'wf-06-ganze-woche-ansicht.png' })
}

let chefBestaetigt = false
for (let i = 0; i < 10; i++) {
  const btn = page.locator('button').filter({ hasText: /wochenchef bestätig|als wochenchef/i }).first()
  if (await btn.count() > 0) {
    await btn.scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'wf-06b-chef-btn-gefunden.png' })
    await btn.click()
    console.log('  "Als Wochenchef bestätigen" geklickt')
    await page.waitForTimeout(6000)
    await page.screenshot({ path: 'wf-07-plan-final-bestaetigt.png' })
    chefBestaetigt = true
    break
  }
  await page.evaluate(() => window.scrollBy(0, 280))
  await page.waitForTimeout(300)
}
if (!chefBestaetigt) {
  const allB = await page.locator('button').allTextContents()
  console.log('  KEIN Chef-Bestätigen-Button — alle Buttons:', allB.filter(t => t.trim()).slice(0, 15))
  await page.screenshot({ path: 'wf-06-kein-chef-btn.png' })
}

await logout(page)

// ──────────────────────────────────────────────────────────────
// SCHRITT 3: Tim — NACH Bestätigung einen Alternativ-Wunsch eintragen
// ──────────────────────────────────────────────────────────────
console.log('\n=== SCHRITT 3: Tim — Alternativ-Wunsch NACH Bestätigung eintragen ===')
await login(page, 'Tim')
await goToWoche(page)
await page.screenshot({ path: 'wf-06-tim-nach-bestaetigung.png' })

await page.evaluate(() => window.scrollTo(0, 300))
await page.waitForTimeout(500)
await page.screenshot({ path: 'wf-07-tim-plan-gescrollt.png' })

const wunschBtns = page.locator('button').filter({ hasText: /wunsch|änderung/i })
const wunschCount = await wunschBtns.count()
console.log(`  Wunsch-Buttons gefunden: ${wunschCount}`)

if (wunschCount > 0) {
  await wunschBtns.first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'wf-08-wunsch-form.png' })

  const altBtn = page.locator('button').filter({ hasText: /eigenes.gericht|alternative|✏️/i }).first()
  if (await altBtn.count() > 0) {
    await altBtn.click()
    await page.waitForTimeout(400)
  }

  const textInput = page.locator('input[type="text"]').first()
  if (await textInput.count() > 0) {
    await textInput.fill('Pizza')
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: 'wf-09-pizza-eingegeben.png' })

  const saveBtn = page.locator('button').filter({ hasText: /speicher|einreich|wunsch schick|ok/i }).first()
  if (await saveBtn.count() > 0) {
    await saveBtn.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'wf-10-pizza-gespeichert.png' })
  } else {
    console.log('  KEIN Speichern-Button gefunden')
    await page.screenshot({ path: 'wf-10-kein-speichern-btn.png' })
  }
} else {
  console.log('  KEIN Wunsch-Button für Tim sichtbar — Plan für Tim noch nicht sichtbar?')
  const allBtns = page.locator('button')
  const btns = await allBtns.allTextContents()
  console.log('  Alle Buttons auf der Seite:', btns.slice(0, 10))
}

await logout(page)

// ──────────────────────────────────────────────────────────────
// SCHRITT 4: Heiko — Bug-Check: nachträglichen Wunsch bestätigbar?
// ──────────────────────────────────────────────────────────────
console.log('\n=== SCHRITT 4: Heiko — Bug-Check nachträglicher Alternativ-Wunsch ===')
await login(page, 'Heiko')
await goToWoche(page)
await page.screenshot({ path: 'wf-11-heiko-bugcheck-home.png' })

const ganzeWoche2 = page.locator('button, a').filter({ hasText: /ganze woche/i }).first()
if (await ganzeWoche2.count() > 0) {
  await ganzeWoche2.click()
  await page.waitForTimeout(1500)
  console.log('  Volle Wochenansicht geöffnet')
}
await page.screenshot({ path: 'wf-12-heiko-volle-woche.png' })

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(600)
await page.screenshot({ path: 'wf-12b-heiko-scroll-unten.png' })

const radioButtons    = page.locator('button').filter({ hasText: /◉|○/ })
const chefBtnNach     = page.locator('button').filter({ hasText: /wochenchef bestätig|als wochenchef/i })
const nachtragsBox    = page.locator('text=/Nachtrags/i')
const alternativenBox = page.locator('text=Alternativen')

const radioCount2 = await radioButtons.count()
const chefBtn2    = await chefBtnNach.count()
const nachtrag2   = await nachtragsBox.count()
const altBox2     = await alternativenBox.count()

console.log(`  Radio-Buttons (◉/○): ${radioCount2}`)
console.log(`  Chef-Bestätigen-Button: ${chefBtn2}`)
console.log(`  Nachtrags-Sektion: ${nachtrag2}`)
console.log(`  "Alternativen"-Abschnitt: ${altBox2}`)

const allBtns2 = page.locator('button')
const btnTexts2 = await allBtns2.allTextContents()
console.log('  Alle Buttons:', btnTexts2.filter(t => t.trim()).slice(0, 15))

await page.screenshot({ path: 'wf-13-bug-check-final.png' })

if (altBox2 > 0) {
  const altEl = page.locator('text=Alternativen').first()
  await altEl.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'wf-14-alternativen-nahaufnahme.png' })
}

await browser.close()

console.log('\n=== TEST ABGESCHLOSSEN ===')
console.log('Bug-Verdict:')
if (altBox2 > 0 && radioCount2 === 0 && chefBtn2 === 0) {
  console.log('  ❌ BUG BESTÄTIGT: Alternativen sichtbar, aber kein Bestätigungs-Mechanismus vorhanden')
} else if (altBox2 > 0 && radioCount2 > 0) {
  console.log('  ✅ OK: Alternativen mit Radio-Buttons bestätigbar')
} else if (altBox2 === 0) {
  console.log('  ⚠️  Alternativen-Sektion gar nicht sichtbar — Wunsch wurde ggf. nicht gespeichert')
}
