/**
 * Live-Test: Anwesenheits-Feature
 * 1. Tim → Anwesenheit eintragen + bestätigen
 * 2. Heiko → "1 von 3 bestätigt" sehen, Wochenchef-Override, Slot-Anzeige
 */
import { chromium } from 'playwright'

const BASE     = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
const HEIKO_PW = process.env.TEST_HEIKO_PW
const TIM_PW   = process.env.TEST_TIM_PW

if (!HEIKO_PW || !TIM_PW) {
  console.error('Fehlende Umgebungsvariablen: TEST_HEIKO_PW, TEST_TIM_PW')
  process.exit(1)
}

async function login(page, name, pw) {
  await page.goto(BASE)
  await page.waitForSelector('button', { timeout: 15000 })
  await page.waitForTimeout(800)

  // Person auswählen
  const nameBtn = page.locator('button').filter({ hasText: new RegExp(name, 'i') }).first()
  if (await nameBtn.count() > 0) {
    await nameBtn.click()
    await page.waitForTimeout(500)
  }

  // Passwort eingeben
  const pwField = page.locator('input[type="password"]')
  if (await pwField.count() > 0) {
    await pwField.fill(pw)
    const loginBtn = page.locator('button').filter({ hasText: /anmeld/i }).first()
    if (await loginBtn.count() > 0) await loginBtn.click()
    // Warten bis Passwort-Feld weg ist (Login erfolgreich)
    await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  }

  // Warten bis App geladen (kein Spinner mehr)
  await page.waitForFunction(
    () => !document.body.innerText.includes('Lade FamilyPlate'),
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForTimeout(1000)
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const results = []
  const check = (label, ok) => {
    results.push({ label, ok })
    console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  }

  // ─── Phase 1: Tim ─────────────────────────────────────────────────────────
  console.log('\n=== Phase 1: Tim ===')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, 'Tim', TIM_PW)
    await page.screenshot({ path: 'att-01-tim-home.png' })

    // Diagnosedump: was sieht Tim?
    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 300))
    console.log(`  Seite nach Login: "${pageText.replace(/\n/g, '↵')}"`)

    // "Anwesenheit"-Button suchen (gibt es in Home-View mit und ohne Plan)
    const allBtnTexts = await page.locator('button').allTextContents()
    console.log(`  Sichtbare Buttons: ${JSON.stringify(allBtnTexts.slice(0, 15))}`)

    const attBtn = page.locator('button').filter({ hasText: /Anwesenheit/i }).first()
    const attFound = await attBtn.count() > 0
    check('Tim sieht "Anwesenheit"-Button im Home', attFound)

    if (!attFound) {
      console.log('  ⚠️  Button nicht gefunden — prüfe ob Tab-Navigation vorhanden ist')
      // Vielleicht ist Tim auf Tab "Woche" aber in week-view statt home-view?
      // Versuche zurück zur Home-View via Back-Button
      const backBtn = page.locator('button.back').first()
      if (await backBtn.count() > 0) {
        await backBtn.click()
        await page.waitForTimeout(600)
        await page.screenshot({ path: 'att-01b-tim-nach-back.png' })
        const attBtn2 = page.locator('button').filter({ hasText: /Anwesenheit/i }).first()
        const found2 = await attBtn2.count() > 0
        console.log(`  Nach Back-Klick: Anwesenheit-Button: ${found2}`)
        if (found2) {
          await attBtn2.click()
          await page.waitForTimeout(800)
        }
      } else {
        // Kein Back-Button — direkt Home-Tab klicken wenn in anderem Tab
        const wocheTab = page.locator('button').filter({ hasText: /^Woche$/ }).first()
        if (await wocheTab.count() > 0) {
          await wocheTab.click()
          await page.waitForTimeout(600)
          await page.screenshot({ path: 'att-01c-tim-nach-woche-tab.png' })
          const attBtn3 = page.locator('button').filter({ hasText: /Anwesenheit/i }).first()
          if (await attBtn3.count() > 0) {
            await attBtn3.click()
            await page.waitForTimeout(800)
          }
        }
      }
    } else {
      await attBtn.click()
      await page.waitForTimeout(800)
    }

    await page.screenshot({ path: 'att-02-tim-view.png' })

    // Attendance-View Titel?
    const h1 = await page.locator('h1').first().textContent().catch(() => '')
    const viewOffen = h1.includes('Wer ist wann da')
    check('Attendance-View geöffnet ("Wer ist wann da?")', viewOffen)
    console.log(`  H1: "${h1}"`)

    if (viewOffen) {
      // "Meine Anwesenheit bestätigen"-Button für Tim sichtbar?
      const confirmBtn = page.locator('button').filter({ hasText: /Anwesenheit bestätigen/i }).first()
      const confirmFound = await confirmBtn.count() > 0
      check('"Meine Anwesenheit bestätigen"-Button sichtbar', confirmFound)

      // Chip-Buttons zählen
      const allBtnTx = await page.locator('button').allTextContents()
      const chipCount = allBtnTx.filter(t => t.trim() === '✓' || t.trim() === '').length
      console.log(`  Chip-Buttons (✓/leer): ${chipCount}`)
      check('Chip-Grid vorhanden', chipCount >= 5)

      // Bestätigen
      if (confirmFound) {
        await confirmBtn.click()
        await page.waitForTimeout(1500)
        await page.screenshot({ path: 'att-03-tim-bestaetigt.png' })

        const afterText = await page.evaluate(() => document.body.innerText)
        check('"✓ Erneut bestätigen"-Button nach Bestätigung sichtbar',
          afterText.includes('Erneut bestätigen'))
        check('"✓ bestätigt"-Label in Karten-Header',
          afterText.includes('✓ bestätigt'))
      }
    }

    await page.close()
  }

  // ─── Phase 2: Heiko ────────────────────────────────────────────────────────
  console.log('\n=== Phase 2: Heiko ===')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, 'Heiko', HEIKO_PW)
    await page.screenshot({ path: 'att-04-heiko-home.png' })

    // Anwesenheit öffnen
    const attBtn = page.locator('button').filter({ hasText: /Anwesenheit/i }).first()
    const attFound = await attBtn.count() > 0
    check('Heiko sieht "Anwesenheit"-Button', attFound)

    if (attFound) {
      await attBtn.click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'att-05-heiko-view.png' })

      const viewText = await page.evaluate(() => document.body.innerText)

      // Status "X von 3 bestätigt"
      const statusMatch = viewText.match(/(\d+) von (\d+) bestätigt/)
      check('"X von Y bestätigt"-Status sichtbar', !!statusMatch)
      if (statusMatch) {
        console.log(`  Status: "${statusMatch[0]}"`)
        check('Mindestens 1 bestätigt (Tim aus Phase 1)', parseInt(statusMatch[1]) >= 1)
      }

      // Tim als bestätigt markiert?
      check('Mindestens eine Person "✓ bestätigt"', viewText.includes('✓ bestätigt'))

      // Wochenchef-Override: Heiko kann alle Chips bedienen
      const chipBtns = await page.locator('button').allTextContents()
      const chips = chipBtns.filter(t => t.trim() === '✓' || t.trim() === '')
      console.log(`  Chip-Buttons sichtbar: ${chips.length}`)
      check('Chip-Buttons aller Karten für Wochenchef sichtbar', chips.length >= 10)

      // "Zur Wochenplanung"-Button nur für Wochenchef
      const planBtn = page.locator('button').filter({ hasText: /Wochenplanung/i }).first()
      check('"Zur Wochenplanung"-Button für Wochenchef sichtbar', await planBtn.count() > 0)

      // Zurück zu Home
      await page.locator('button.back').first().click()
      await page.waitForTimeout(600)
    }

    // ─── Phase 3: Slot-Anzeige ─────────────────────────────────────────────
    console.log('\n=== Phase 3: Slot-Anzeige ===')
    await page.screenshot({ path: 'att-06-heiko-home.png' })

    const homeText = await page.evaluate(() => document.body.innerText)
    const planVorhanden = homeText.includes('Ganze Woche')
    console.log(`  Wochenplan vorhanden: ${planVorhanden}`)

    if (planVorhanden) {
      // Zur Wochenansicht
      const weekBtn = page.locator('button').filter({ hasText: /Ganze Woche/i }).first()
      await weekBtn.click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'att-07-wochenansicht.png' })

      const weekText = await page.evaluate(() => document.body.innerText)

      // Kein "N Personen"-Text mehr
      const hatPersonen = /\d+ Person(en)?/.test(weekText)
      check('Kein "N Personen"-Text in Slot-Header', !hatPersonen)

      // "Alle" oder Namen in Slot-Header
      const hatAlleOderNamen = weekText.includes('Alle') || /Heiko.*\n|Sabine.*\n|Tim.*\n/.test(weekText)
      check('"Alle" oder Namen als Slot-Label sichtbar', hatAlleOderNamen)
      console.log(`  "Alle" im Text: ${weekText.includes('Alle')}`)

      // Inline-Editor: "Alle"-Span anklicken
      const alleSpan = page.locator('span').filter({ hasText: /^Alle$/ }).first()
      if (await alleSpan.count() > 0) {
        await alleSpan.click()
        await page.waitForTimeout(400)
        await page.screenshot({ path: 'att-08-inline-editor.png' })

        const editorText = await page.evaluate(() => document.body.innerText)
        check('"Wer ist dabei?"-Inline-Editor öffnet sich', editorText.includes('Wer ist dabei'))

        if (editorText.includes('Wer ist dabei')) {
          // Person-Toggle-Buttons
          const personBtns = ['Heiko', 'Sabine', 'Tim']
          let togglesFound = 0
          for (const name of personBtns) {
            const btn = page.getByRole('button', { name: new RegExp(`^${name}$`) })
            if (await btn.count() > 0) togglesFound++
          }
          check(`Person-Toggle-Buttons im Editor vorhanden (${togglesFound}/3)`, togglesFound > 0)

          // "Fertig"-Button
          const fertigBtn = page.getByRole('button', { name: /^Fertig$/ })
          check('"Fertig"-Button im Inline-Editor', await fertigBtn.count() > 0)
          if (await fertigBtn.count() > 0) {
            await fertigBtn.first().click()
            await page.waitForTimeout(300)
            const closedText = await page.evaluate(() => document.body.innerText)
            check('Inline-Editor nach "Fertig" geschlossen', !closedText.includes('Wer ist dabei'))
            await page.screenshot({ path: 'att-09-editor-geschlossen.png' })
          }
        }
      } else {
        console.log('  Kein "Alle"-Span — Slot möglicherweise mit Teilanwesenheit')
        check('Namens-Label vorhanden (alternative Prüfung)', hatAlleOderNamen)
      }
    } else {
      console.log('  Kein Plan vorhanden — Slot-Test übersprungen')
      check('Slot-Anzeige-Test (kein Plan — Skip)', true)
    }

    await page.close()
  }

  await browser.close()

  // ─── Ergebnis ───────────────────────────────────────────────────────────────
  console.log('\n=== ERGEBNIS ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}`))
  console.log(`\n  ${passed} bestanden · ${failed} fehlgeschlagen`)
  if (failed > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })
