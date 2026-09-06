/**
 * Kombinierter Live-Test für alle vier Features aus diesem Sprint:
 *
 * T1: Tag-Chips in EinkaufScreen (Zusammengefasst + Nach Laden)
 * T2: DRINGEND-Flag in Rémy-Prompt (getFreezerListString / getPantryListString)
 * T3: Auto-Entfernen aus Gefriertruhe bei Reste-Gericht (Feature 2a)
 * T4: Vorrats-Hinweis-Banner nach Planbestätigung mit Speisekammer-Gericht
 */
import { chromium } from 'playwright'

const BASE         = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
const HEIKO_PW     = process.env.TEST_HEIKO_PW

if (!HEIKO_PW) { console.error('TEST_HEIKO_PW fehlt'); process.exit(1) }

const SUPABASE_RE = /supabase\.co\/rest\/v1\//

async function login(page, name, pw) {
  await page.goto(BASE)
  await page.waitForSelector('button', { timeout: 15000 })
  await page.waitForTimeout(800)
  const nb = page.locator('button').filter({ hasText: new RegExp(name, 'i') }).first()
  if (await nb.count() > 0) { await nb.click(); await page.waitForTimeout(400) }
  const pf = page.locator('input[type="password"]')
  if (await pf.count() > 0) {
    await pf.fill(pw)
    const lb = page.locator('button').filter({ hasText: /anmeld/i }).first()
    if (await lb.count() > 0) await lb.click()
    await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
  }
  await page.waitForFunction(() => !document.body.innerText.includes('Lade FamilyPlate'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

/**
 * Richtet Supabase-Mock per REGEX-Route ein (funktioniert auch mit Query-Strings).
 */
async function setupSupabaseMock(page, { planData, freezerItems, pantryItems, onDelete }) {
  await page.route(SUPABASE_RE, async route => {
    const url   = route.request().url()
    const meth  = route.request().method()
    const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '?'
    console.log(`    [mock] ${meth} ${table}`)

    if (url.includes('/week_plans')) {
      if (meth === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            plan_data: planData ?? [],
            meals_data: {},
            wishes: [],
            attendance: [],
            shopping_list: [],
            proposals: [],
            wochenchef: 'PA',
            plan_confirmed: false,
            shopping_done: false,
            shopping_day: 'Dienstag,Freitag',
            attendanceConfirmed: [],
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      }
    } else if (url.includes('/freezer_items')) {
      if (meth === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(freezerItems ?? []) })
      } else if (meth === 'DELETE') {
        onDelete?.(url)
        await route.fulfill({ status: 204, body: '' })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      }
    } else if (url.includes('/pantry_items')) {
      if (meth === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pantryItems ?? []) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      }
    } else {
      await route.continue()
    }
  })
}

/**
 * Führt den kompletten Plan-Flow durch:
 *   1. "🐀 Woche planen" klicken → plan view (planState='options')
 *   2. "🐀 Rémy schlägt vor" klicken → startPlanning() → planState='results'
 *   3. "✅ Plan übernehmen" klicken → acceptPlan()
 */
async function durchlaufePlanFlow(page, { waitForApi = 4000 } = {}) {
  const bodyBefore = await page.evaluate(() => document.body.innerText)
  console.log(`    [flow] "Woche planen" im DOM: ${bodyBefore.includes('Woche planen')}`)
  console.log(`    [flow] "Rémy schlägt vor" im DOM: ${bodyBefore.includes('Rémy schlägt vor')}`)

  // Schritt 1: "Woche planen" klicken
  const wocheBtn = page.locator('button').filter({ hasText: /Woche planen/ }).first()
  if (await wocheBtn.count() === 0) {
    console.log('    [flow] Schritt 1 fehlgeschlagen: "Woche planen" nicht gefunden')
    return { step1: false, step2: false, step3: false }
  }
  await wocheBtn.click(); await page.waitForTimeout(600)

  // Schritt 2: "Rémy schlägt vor" klicken (jetzt im plan view)
  const remyBtn = page.locator('button').filter({ hasText: /Rémy schlägt vor/ }).first()
  if (await remyBtn.count() === 0) {
    const body2 = await page.evaluate(() => document.body.innerText)
    console.log(`    [flow] Schritt 2 fehlgeschlagen. Body: "${body2.slice(0, 200)}"`)
    return { step1: true, step2: false, step3: false }
  }
  await remyBtn.click()
  await page.waitForTimeout(waitForApi)

  // Schritt 3: "Plan übernehmen" klicken (planState='results')
  const uebernehmenBtn = page.locator('button').filter({ hasText: /Plan übernehmen/ }).first()
  if (await uebernehmenBtn.count() === 0) {
    const body3 = await page.evaluate(() => document.body.innerText)
    console.log(`    [flow] Schritt 3 fehlgeschlagen. Body: "${body3.slice(0, 300)}"`)
    return { step1: true, step2: true, step3: false }
  }
  await uebernehmenBtn.click()
  await page.waitForTimeout(2000)
  return { step1: true, step2: true, step3: true }
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const results = []
  const check = (label, ok) => { results.push({ label, ok }); console.log(`  ${ok ? '✅' : '❌'} ${label}`) }

  // ═══════════════════════════════════════════════════════════════════════════
  // T1: Tag-Chips in EinkaufScreen
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n══ T1: Tag-Chips in EinkaufScreen ══')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, 'Heiko', HEIKO_PW)
    const einkaufTab = page.locator('button.nav-tab').filter({ hasText: /Einkauf/i }).first()
    await einkaufTab.click(); await page.waitForTimeout(800)

    for (const mode of ['Zusammengefasst', 'Nach Laden']) {
      const btn = page.locator('button').filter({ hasText: new RegExp(mode, 'i') }).first()
      if (await btn.count() > 0) {
        await btn.click(); await page.waitForTimeout(500)
        const chipCount = await page.locator('span').filter({ hasText: /^(Mo|Di|Mi|Do|Fr|Sa|So)\s/ }).count()
        const chipBg = chipCount > 0
          ? await page.locator('span').filter({ hasText: /^(Mo|Di|Mi|Do|Fr|Sa|So)\s/ }).first()
              .evaluate(el => window.getComputedStyle(el).backgroundColor)
          : 'none'
        console.log(`  ${mode}: ${chipCount} Chips, bg=${chipBg}`)
        check(`${mode}: Tag-Chips vorhanden`, chipCount > 0)
        check(`${mode}: Chip-Hintergrund sichtbar`, chipBg !== 'rgba(0, 0, 0, 0)' && chipBg !== 'none')
      } else {
        check(`${mode}: Button nicht gefunden`, false)
        check(`${mode}: Chip-Hintergrund (Skip)`, true)
      }
    }
    await page.close()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // T2: DRINGEND-Flag in Rémy-Prompt
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n══ T2: DRINGEND-Flag im Rémy-Prompt ══')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    let capturedBody = null
    await page.route('**/api/week-plan', async route => {
      try { capturedBody = route.request().postDataJSON() } catch { capturedBody = null }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          woche: [{ tag: 'Montag', slot: 'Abend', emoji: '🍝', gericht: 'Testgericht', minuten: 30, quelle: 'frisch', chef: 'PA' }],
          rezepte: { Testgericht: { name: 'Testgericht', emoji: '🍝', zutaten: [], schritte: [], minuten: 30, schwierigkeit: 'Einfach', ersetzteZutaten: [] } }
        })
      })
    })

    await setupSupabaseMock(page, {
      planData: [],
      freezerItems: [{ id: 'fz-lachs', name: 'Lachs', menge: '2 Stück', typ: 'roh', datum: '01.01.2026', ampel: 'red', family_id: 'flechner' }],
      pantryItems:  [
        { id: 'pt-tomaten', name: 'Tomaten', menge: '3 Dosen', ampel: 'red',   family_id: 'flechner' },
        { id: 'pt-pasta',   name: 'Pasta',   menge: '500g',    ampel: 'green', family_id: 'flechner' },
      ],
      onDelete: null,
    })

    await login(page, 'Heiko', HEIKO_PW)
    const flow = await durchlaufePlanFlow(page, { waitForApi: 2000 })

    if (!flow.step2) {
      check('Plan-Flow bis Rémy-Aufruf (Schritt 1+2)', false)
      check('Freezer DRINGEND-Flag (Skip)', true)
      check('Pantry DRINGEND-Flag (Skip)', true)
      check('Pantry red-Artikel nicht ausgefiltert (Skip)', true)
      check('Pasta ohne DRINGEND (Skip)', true)
    } else {
      const fl = capturedBody?.freezerList ?? ''
      const pl = capturedBody?.pantryList  ?? ''
      console.log(`  freezerList: "${fl}"`)
      console.log(`  pantryList:  "${pl}"`)
      check('Rémy-API wurde aufgerufen', capturedBody != null)
      check('Freezer: Lachs [DRINGEND – bald aufgebraucht]', fl.includes('[DRINGEND'))
      check('Pantry: Tomaten (red) nicht ausgefiltert', pl.includes('Tomaten'))
      check('Pantry: Tomaten [DRINGEND verwenden]', pl.includes('[DRINGEND'))
      check('Pantry: Pasta (green) ohne DRINGEND', !pl.includes('Pasta [DRINGEND') && !pl.includes('Pasta (500g) ['))
    }
    await page.close()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // T3: Auto-Entfernen aus Gefriertruhe bei Reste-Gericht
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n══ T3: Auto-Entfernen FreezerItem bei Reste-Gericht ══')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    const deletedUrls = []
    await page.route('**/api/week-plan', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          woche: [
            { tag: 'Montag',   slot: 'Abend', emoji: '🥗', gericht: 'Reste: Lasagne',  minuten: 10, quelle: 'reste',  chef: 'PA' },
            { tag: 'Dienstag', slot: 'Abend', emoji: '🍗', gericht: 'Hähnchen-Pasta', minuten: 30, quelle: 'frisch', chef: 'MA' },
          ],
          rezepte: {
            'Reste: Lasagne': { name: 'Reste: Lasagne', emoji: '🥗', zutaten: [], schritte: ['Aufwärmen'], minuten: 10, schwierigkeit: 'Einfach', ersetzteZutaten: [] },
            'Hähnchen-Pasta': { name: 'Hähnchen-Pasta', emoji: '🍗', zutaten: [], schritte: ['Kochen'],    minuten: 30, schwierigkeit: 'Einfach', ersetzteZutaten: [] },
          }
        })
      })
    })

    await setupSupabaseMock(page, {
      planData: [],
      freezerItems: [
        { id: 'fz-lasagne', name: 'Lasagne',    menge: '3 Portionen', typ: 'fertig', datum: '01.09.2026', ampel: 'green', family_id: 'flechner' },
        { id: 'fz-lachs',   name: 'Lachsfilet', menge: '2 Stück',     typ: 'roh',    datum: '01.08.2026', ampel: 'red',   family_id: 'flechner' },
      ],
      pantryItems: [],
      onDelete: url => { deletedUrls.push(url); console.log(`    [DELETE] ${url}`) },
    })

    await login(page, 'Heiko', HEIKO_PW)
    const flow = await durchlaufePlanFlow(page, { waitForApi: 2000 })

    console.log(`  DELETE-Aufrufe: ${deletedUrls.length > 0 ? deletedUrls.join(', ') : '(keine)'}`)

    if (!flow.step3) {
      check(`Plan-Flow Schritt 1: ${flow.step1 ? 'ok' : 'fehlgeschlagen'}`, flow.step1)
      check(`Plan-Flow Schritt 2: ${flow.step2 ? 'ok' : 'fehlgeschlagen'}`, flow.step2)
      check('Plan-Flow Schritt 3 "Plan übernehmen" (fehlgeschlagen)', false)
      check('Lachsfilet nicht gelöscht (Skip)', true)
    } else {
      const lasagneGeloescht = deletedUrls.some(u => u.includes('fz-lasagne'))
      const lachsNichtGeloescht = !deletedUrls.some(u => u.includes('fz-lachs'))
      check('Plan-Flow vollständig (3/3 Schritte)', true)
      check('Lasagne-FreezerItem (fz-lasagne) gelöscht', lasagneGeloescht)
      check('Lachsfilet (fz-lachs) NICHT gelöscht', lachsNichtGeloescht)
    }
    await page.close()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // T4: Vorrats-Hinweis-Banner bei Speisekammer-Gericht
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n══ T4: Vorrats-Hinweis-Banner (Speisekammer) ══')
  {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.route('**/api/week-plan', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          woche: [{ tag: 'Montag', slot: 'Abend', emoji: '🍜', gericht: 'Nudelsuppe', minuten: 20, quelle: 'speisekammer', chef: 'PA' }],
          rezepte: { Nudelsuppe: { name: 'Nudelsuppe', emoji: '🍜', zutaten: [], schritte: [], minuten: 20, schwierigkeit: 'Einfach', ersetzteZutaten: [] } }
        })
      })
    })

    await setupSupabaseMock(page, { planData: [], freezerItems: [], pantryItems: [], onDelete: null })
    await login(page, 'Heiko', HEIKO_PW)
    const flow = await durchlaufePlanFlow(page, { waitForApi: 2000 })

    if (!flow.step3) {
      check(`Plan-Flow Schritt 1: ${flow.step1 ? 'ok' : 'fehlgeschlagen'}`, flow.step1)
      check(`Plan-Flow Schritt 2: ${flow.step2 ? 'ok' : 'fehlgeschlagen'}`, flow.step2)
      check('Plan-Flow Schritt 3 "Plan übernehmen" (fehlgeschlagen)', false)
      check('Banner × schließbar (Skip)', true)
    } else {
      const bodyText = await page.evaluate(() => document.body.innerText)
      const hatBanner = bodyText.includes('Speisekammer') && bodyText.includes('Vorräte')
      console.log(`  Body "Speisekammer": ${bodyText.includes('Speisekammer')}, "Vorräte": ${bodyText.includes('Vorräte')}`)
      check('Plan-Flow vollständig (3/3 Schritte)', true)
      check('Vorrats-Hinweis-Banner sichtbar', hatBanner)
      const closeBtn = page.locator('button').filter({ hasText: /×/ }).first()
      if (await closeBtn.count() > 0) {
        await closeBtn.click(); await page.waitForTimeout(500)
        const afterClose = await page.evaluate(() => document.body.innerText)
        check('Banner nach ×-Klick geschlossen', !afterClose.includes('Speisekammer-Vorräte prüfen'))
      } else {
        check('×-Schließen-Button vorhanden', false)
      }
    }
    await page.close()
  }

  await browser.close()

  console.log('\n══════════════════════════════════════')
  console.log('GESAMTERGEBNIS')
  console.log('══════════════════════════════════════')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}`))
  console.log(`\n  ${passed}/${results.length} bestanden`)
  if (failed > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })
