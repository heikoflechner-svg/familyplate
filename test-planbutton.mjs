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
const shot = (page, name) => page.screenshot({ path: `planfix-${name}.png` })

let pass = 0; let fail = 0
function check(label, ok) {
  if (ok) { console.log(`  ✅ ${label}`); pass++ }
  else    { console.log(`  ❌ ${label}`); fail++ }
}

async function login(page, name, pw) {
  await page.goto(BASE, { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.locator('text=' + name).first().click().catch(() => {})
  await page.waitForTimeout(400)
  const pwInput = page.locator('input[type="password"]')
  if (await pwInput.count() > 0) {
    await pwInput.fill(pw)
    await page.locator('button').filter({ hasText: /anmeld/i }).first().click().catch(() => {})
  }
  await page.waitForSelector('.nav', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

// Setup: leerer Plan, Heiko als Wochenchef
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
const { data: existing } = await supabase.from('week_plans')
  .select('id').eq('family_id', FAMILY_ID).limit(1).single()
if (!existing?.id) { console.error('Kein week_plans-Eintrag'); process.exit(1) }
await supabase.from('week_plans').update({
  plan_data: [], meals_data: {}, plan_confirmed: false,
  wochenchef: 'PA', week_start: null, next_week_data: null,
}).eq('id', existing.id)
await supabase.auth.signOut()

const browser = await chromium.launch({ headless: true })

// ─── Test 1: Heiko sieht Button ───────────────────────────────────────────
console.log('\n[1] Heiko (wochenchef) sieht Plan-Button')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  await shot(page, '01-heiko')
  const body = await page.locator('body').innerText()
  check('Plan-Button sichtbar', body.includes('Woche planen'))
  check('Kein "Wochenchef:"-Hinweis (ist selbst Chef)', !body.includes('Wochenchef: Heiko'))
  await page.close()
}

// ─── Test 2: Sabine sieht jetzt auch Button ───────────────────────────────
console.log('\n[2] Sabine (nicht Wochenchef) sieht jetzt Plan-Button')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Sabine', SABINE_PW)
  await shot(page, '02-sabine')
  const body = await page.locator('body').innerText()
  check('Plan-Button auch für Sabine sichtbar', body.includes('Woche planen'))
  check('"Wochenchef: Heiko"-Hinweis sichtbar', body.includes('Wochenchef:') && body.includes('Heiko'))
  check('Altes "plant die Woche"-Text weg', !body.includes('plant die Woche'))
  await page.close()
}

// ─── Test 3: Sabine klickt Button → Plan-View öffnet sich ────────────────
console.log('\n[3] Sabine klickt Button → Plan-View öffnet sich')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Sabine', SABINE_PW)
  const planBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
  if (await planBtn.count() > 0) {
    await planBtn.click()
    await page.waitForTimeout(800)
    await shot(page, '03-sabine-planview')
    const body = await page.locator('body').innerText()
    check('Plan-View geöffnet (Rémy-Button sichtbar)', body.includes('Rémy') || body.includes('Wochenplan'))
  } else {
    check('Plan-Button für Sabine gefunden', false)
    check('Plan-View geöffnet', false)
  }
  await page.close()
}

// ─── Test 4: Heiko klickt Button → Plan-View öffnet sich ────────────────
console.log('\n[4] Heiko klickt Button → Plan-View öffnet sich')
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'Heiko', HEIKO_PW)
  const planBtn = page.locator('button').filter({ hasText: /Woche planen/i }).first()
  if (await planBtn.count() > 0) {
    await planBtn.click()
    await page.waitForTimeout(800)
    await shot(page, '04-heiko-planview')
    const body = await page.locator('body').innerText()
    check('Plan-View für Heiko geöffnet', body.includes('Rémy') || body.includes('Wochenplan'))
  } else {
    check('Plan-Button für Heiko gefunden', false)
    check('Plan-View geöffnet', false)
  }
  await page.close()
}

await browser.close()

// Cleanup
await supabase.auth.signInWithPassword({ email: HEIKO_EMAIL, password: HEIKO_PW })
await supabase.from('week_plans').update({
  plan_data: [], meals_data: {}, plan_confirmed: false, wochenchef: 'PA',
}).eq('id', existing.id)
await supabase.auth.signOut()

console.log(`\n${'─'.repeat(40)}`)
console.log(`Ergebnis: ${pass} ✅  ${fail} ❌  (${pass + fail} Tests)`)
if (fail > 0) process.exit(1)
