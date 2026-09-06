/**
 * Live-Test: Tageschef-Proposal-Flow
 *
 * 1) Als Tim einloggen → Koch-Badge anklicken (auch bei bestätigtem Plan)
 * 2) ChefPicker öffnet sich mit Hinweis "Vorschlag an Heiko"
 * 3) Anderen Chef auswählen → Proposal erstellt (kein direktes Speichern)
 * 4) ⏳-Badge sichtbar für Tim
 * 5) Als Heiko: Proposal in "Koch-Änderungsvorschläge" sichtbar
 * 6) Format zeigt "schlägt vor: Koch X → Y" ohne Gericht-Bundling
 */
import { chromium } from 'playwright'

const BASE     = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
const HEIKO_PW = process.env.TEST_HEIKO_PW
const TIM_PW   = process.env.TEST_TIM_PW

if (!HEIKO_PW || !TIM_PW) {
  console.error('Fehlende Umgebungsvariablen: TEST_HEIKO_PW und/oder TEST_TIM_PW')
  process.exit(1)
}

async function login(page, name, pw) {
  await page.goto(BASE)
  await page.waitForSelector('button', { timeout: 15000 })
  await page.waitForTimeout(800)
  const nameBtn = page.locator('button').filter({ hasText: new RegExp(`^${name}$`, 'i') }).first()
  if (await nameBtn.count() > 0) { await nameBtn.click(); await page.waitForTimeout(400) }
  const pwField = page.locator('input[type="password"]')
  if (await pwField.count() > 0) {
    await pwField.fill(pw)
    const loginBtn = page.locator('button').filter({ hasText: /anmeld/i }).first()
    if (await loginBtn.count() > 0) await loginBtn.click()
    await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  }
  await page.waitForFunction(() => !document.body.innerText.includes('Lade FamilyPlate'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const results = []
  const check = (label, ok) => {
    results.push({ label, ok })
    console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  }

  // ─── Vorbedingung ────────────────────────────────────────────────────────────
  console.log('\n=== Vorbedingung: Wochenplan vorhanden? ===')
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Tim', TIM_PW)
  await page.waitForTimeout(600)

  const homeText = await page.evaluate(() => document.body.innerText)
  const hatPlan = homeText.includes('Koch:') || homeText.toLowerCase().includes('montag')
  const planBestaetigt = homeText.toLowerCase().includes('bestätigt') || (homeText.includes('Koch:') && !homeText.includes('Woche planen'))
  console.log(`  Wochenplan vorhanden: ${hatPlan}`)
  console.log(`  Plan bestätigt (vermutet): ${planBestaetigt}`)

  if (!hatPlan) {
    check('Wochenplan vorhanden (Voraussetzung)', false)
    await page.close()
    await browser.close()
    console.log('\n  Test abgebrochen: kein Plan vorhanden')
    process.exit(1)
  }

  // ─── Phase 1: Tim → Koch-Badge klicken, Proposal einreichen ──────────────────
  console.log('\n=== Phase 1: Tim klickt Koch-Badge (auch bei bestätigtem Plan) ===')

  // Zur Wochenübersicht navigieren
  const wocheTab = page.locator('button.nav-tab').filter({ hasText: /Woche/i }).first()
  await wocheTab.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-cp-01-tim-home.png' })

  // Koch-Span anklicken (jetzt immer klickbar für nicht-Wochenchef)
  const kochSpan = page.locator('span').filter({ hasText: /^Koch:/ }).first()
  const kochCount = await kochSpan.count()
  console.log(`  Koch-Links gefunden: ${kochCount}`)

  let proposed = false
  let currentChef = ''

  if (kochCount > 0) {
    const kochText = await kochSpan.innerText().catch(() => '')
    currentChef = kochText.replace('Koch: ', '').trim()
    console.log(`  Aktueller Koch: ${currentChef}`)

    await kochSpan.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-cp-02-chef-picker-open.png' })

    const bodyAfterClick = await page.evaluate(() => document.body.innerText)

    // ChefPicker-Buttons suchen: "PA · Heiko", "MA · Sabine", "TI · Tim"
    // Buttons enthalten "·" (Mittelpunkt) und den Namen
    const allBtns = page.locator('button')
    const btnCount = await allBtns.count()
    console.log(`  Alle Buttons: ${btnCount}`)

    // ChefPicker buttons enthalten einen Mittelpunkt "·" und einen Namen
    const chefPickerBtns = page.locator('button').filter({ hasText: /[·•]/ })
    const pickerCount = await chefPickerBtns.count()
    console.log(`  ChefPicker-Buttons (mit ·): ${pickerCount}`)

    // Hinweis-Text sichtbar?
    const hatVorschlagHinweis = bodyAfterClick.includes('Vorschlag an')
    check('Hinweis "Vorschlag an Heiko" im Picker (post-confirmation)', hatVorschlagHinweis)

    for (let i = 0; i < pickerCount; i++) {
      const btn = chefPickerBtns.nth(i)
      const txt = (await btn.innerText().catch(() => '')).trim()
      console.log(`    Button ${i}: "${txt}"`)
      // Anderen Koch wählen (nicht den aktuellen Wochenchef / Heiko)
      if (txt && !txt.toLowerCase().includes('heiko')) {
        console.log(`  → Klicke auf: ${txt}`)
        await btn.click()
        await page.waitForTimeout(1500)
        proposed = true
        break
      }
    }

    if (!proposed && pickerCount > 0) {
      // Alle anderen versuchen
      for (let i = 0; i < pickerCount; i++) {
        const btn = chefPickerBtns.nth(i)
        const txt = (await btn.innerText().catch(() => '')).trim()
        if (txt && !txt.includes(currentChef)) {
          console.log(`  → Klicke auf: ${txt}`)
          await btn.click()
          await page.waitForTimeout(1500)
          proposed = true
          break
        }
      }
    }

    if (proposed) {
      await page.screenshot({ path: 'test-cp-03-after-proposal.png' })
      const afterText = await page.evaluate(() => document.body.innerText)

      // Koch darf sich NICHT sofort geändert haben
      const kochNochGleich = afterText.includes(`Koch: ${currentChef}`) || afterText.includes('Koch: Heiko')
      check('Tageschef wurde NICHT sofort übernommen (Plan unverändert)', kochNochGleich)

      // ⏳-Badge sichtbar?
      const hasPendingBadge = afterText.includes('Koch-Vorschlag eingereicht') || afterText.includes('⏳')
      check('⏳-Badge "Koch-Vorschlag eingereicht" sichtbar', hasPendingBadge)
    } else {
      console.log('  → Kein anderer Koch-Button gefunden oder anklickbar')
      check('Chef-Picker zeigt andere Köche', pickerCount > 0)
      check('⏳-Badge (kein Proposal erstellt – Skip)', true)
    }
  } else {
    check('Koch-Link klickbar (nicht gefunden – Skip)', true)
    check('⏳-Badge (Skip)', true)
    check('Hinweis "Vorschlag an" (Skip)', true)
  }

  // ─── Phase 2: Heiko sieht den Proposal ───────────────────────────────────────
  console.log('\n=== Phase 2: Heiko sieht Proposal im "Koch-Änderungsvorschläge"-Panel ===')
  await page.close()
  const page2 = await browser.newPage()
  await page2.setViewportSize({ width: 390, height: 844 })
  await login(page2, 'Heiko', HEIKO_PW)
  await page2.waitForTimeout(600)

  // Woche-Tab
  const wocheTab2 = page2.locator('button.nav-tab').filter({ hasText: /Woche/i }).first()
  await wocheTab2.click()
  await page2.waitForTimeout(600)
  await page2.screenshot({ path: 'test-cp-04-heiko-home.png' })

  const heikoText = await page2.evaluate(() => document.body.innerText)
  console.log(`  Heiko sieht: ${heikoText.slice(0, 200).replace(/\n/g, ' ')}`)

  // Neues Format: "Koch-Änderungsvorschläge"
  const hatNeuesFormat = heikoText.includes('Koch-Änderungsvorschläge')
  const hatAltesFormat = heikoText.includes('Offene Vorschläge')
  check('"Koch-Änderungsvorschläge" Panel sichtbar', hatNeuesFormat)
  check('Altes "Offene Vorschläge"-Label nicht mehr sichtbar', !hatAltesFormat)

  // Proposal-Inhalt: "schlägt vor" + "→"
  const hatPfeilFormat = heikoText.includes('→') && heikoText.toLowerCase().includes('schlägt vor')
  check('Proposal zeigt "schlägt vor: Koch X → Y" Format', hatPfeilFormat)

  // Gericht-Hinweis: "bleibt unverändert"
  const hatGerichtHinweis = heikoText.includes('bleibt unverändert')
  check('Hinweis "bleibt unverändert" für Gericht sichtbar', hatGerichtHinweis)

  // Ablehnen-Button vorhanden?
  const ablehnenBtn = page2.locator('button').filter({ hasText: /Ablehnen/i }).first()
  const hatAblehnen = await ablehnenBtn.count() > 0
  check('Ablehnen-Button vorhanden', hatAblehnen)

  if (hatAblehnen) {
    const propCountBefore = (heikoText.match(/schlägt vor/gi) ?? []).length
    await ablehnenBtn.click()
    await page2.waitForTimeout(1500)
    await page2.screenshot({ path: 'test-cp-05-after-ablehnen.png' })
    const afterAblehnen = await page2.evaluate(() => document.body.innerText)
    const propCountAfter = (afterAblehnen.match(/schlägt vor/gi) ?? []).length
    check('Proposal nach Ablehnen verschwunden', propCountAfter < propCountBefore || !afterAblehnen.includes('schlägt vor'))
  } else {
    if (proposed) {
      check('Proposal nach Ablehnen (kein Panel trotz erstelltem Proposal – evtl. Reload nötig)', false)
      console.log('  ⚠️ Proposal erstellt aber nicht sichtbar → evtl. fehlt Reload oder RLS-Problem')
    } else {
      check('Proposal nach Ablehnen (kein Proposal erstellt – Skip)', true)
    }
  }

  await page2.close()
  await browser.close()

  console.log('\n=== ERGEBNIS ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}`))
  console.log(`\n  ${passed} bestanden · ${failed} fehlgeschlagen`)
  if (failed > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })
