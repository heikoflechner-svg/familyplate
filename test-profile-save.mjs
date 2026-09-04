/**
 * Testet saveFamilyProfile gegen die Live-App:
 * 1. Liest aktuelles Profil aus Supabase (Vor-Zustand)
 * 2. Öffnet Profil bearbeiten, navigiert zu Unverträglichkeiten (Schritt 2)
 * 3. Fügt Tim "Soja" hinzu (falls noch nicht vorhanden)
 * 4. Speichert durch alle Schritte
 * 5. Liest Supabase erneut und prüft ob Soja dort angekommen ist
 * 6. Stellt Original-Zustand wieder her
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.TEST_BASE_URL || 'https://familyplate-app.vercel.app'
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

// Vor-Zustand lesen
const { data: before } = await supabase.from('family_profiles').select('members').eq('family_id', 'flechner').single()
const timBefore = before?.members?.find(m => m.id === 'TI')
console.log('TIM vorher — Allergien:', timBefore?.allergien ?? [])
const hadSoja = timBefore?.allergien?.includes('Soja') ?? false

// Browser-Test
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 390, height: 844 })

await page.goto(BASE)
await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(500)
await page.locator('text=Heiko').click().catch(() => {})
await page.waitForTimeout(400)
const pw = page.locator('input[type="password"]')
if (await pw.count() > 0) await pw.fill(HEIKO_PW)
await page.locator('button').filter({ hasText: /anmeld/i }).click().catch(() => {})
await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2000)
console.log('Heiko eingeloggt')

// Profil-Tab öffnen
await page.locator('button').filter({ hasText: /Profil/i }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'ps-01-profil-tab.png' })

// "Profil bearbeiten" klicken → landet auf Schritt 1 (Namen)
const editBtn = page.locator('button').filter({ hasText: /profil bearbeiten|bearbeiten/i }).first()
if (await editBtn.count() > 0) {
  await editBtn.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'ps-02-namen-schritt.png' })
} else {
  console.log('KEIN "Profil bearbeiten"-Button:', await page.locator('button').allTextContents())
}

// Schritt 1 → Schritt 2 (Unverträglichkeiten): einmal "Weiter"
const weiterBtn = page.locator('button').filter({ hasText: /^Weiter$/i }).first()
if (await weiterBtn.count() > 0) {
  await weiterBtn.click()
  await page.waitForTimeout(600)
}
await page.screenshot({ path: 'ps-03-unvertraeglichkeiten.png' })

// "Soja" für Tim suchen und markieren
const sojaButtons = page.locator('button').filter({ hasText: /^Soja$/i })
const sojaCount = await sojaButtons.count()
console.log(`"Soja"-Buttons sichtbar: ${sojaCount}`)

if (sojaCount > 0 && !hadSoja) {
  // Letzten Soja-Button klicken (Tim erscheint zuletzt im Wizard)
  await sojaButtons.last().click()
  await page.waitForTimeout(300)
  console.log('Soja für Tim markiert')
  await page.screenshot({ path: 'ps-04-soja-markiert.png' })
} else if (hadSoja) {
  console.log('Soja war schon gesetzt — Test überspringt Markierung')
}

// Schritt 2 → Schritt 3 (Vorlieben): "Weiter"
const weiter2 = page.locator('button').filter({ hasText: /^Weiter$/i }).first()
if (await weiter2.count() > 0) { await weiter2.click(); await page.waitForTimeout(600) }
await page.screenshot({ path: 'ps-05-vorlieben.png' })

// Schritt 3 abschließen: "Los geht's!" oder "Speichern"
const finishBtn = page.locator('button').filter({ hasText: /los geht|speicher|fertig/i }).first()
if (await finishBtn.count() > 0) {
  await finishBtn.click()
  await page.waitForTimeout(3000)
  console.log('Wizard abgeschlossen')
  await page.screenshot({ path: 'ps-06-gespeichert.png' })
} else {
  console.log('KEIN Abschluss-Button:', await page.locator('button').allTextContents())
  await page.screenshot({ path: 'ps-06-kein-btn.png' })
}

// Fehlermeldung sichtbar?
const errorEl = page.locator('text=/fehlgeschlagen|fehler/i')
const errorCount = await errorEl.count()
console.log(`Sichtbare Fehlermeldung auf Seite: ${errorCount > 0 ? 'JA — ' + await errorEl.first().textContent() : 'Nein'}`)

await browser.close()

// Nach-Zustand aus Supabase lesen (kurz warten damit der Write durchkommt)
await new Promise(r => setTimeout(r, 2000))
const { data: after } = await supabase.from('family_profiles').select('members').eq('family_id', 'flechner').single()
const timAfter = after?.members?.find(m => m.id === 'TI')
console.log('TIM nachher — Allergien:', timAfter?.allergien ?? [])

const sojaGespeichert = timAfter?.allergien?.includes('Soja') ?? false

// Aufräumen: Soja wieder entfernen wenn wir es hinzugefügt haben
if (!hadSoja && sojaGespeichert) {
  const restoredMembers = after.members.map(m =>
    m.id === 'TI' ? { ...m, allergien: m.allergien.filter(a => a !== 'Soja') } : m
  )
  await supabase.from('family_profiles').upsert(
    { family_id: 'flechner', members: restoredMembers, onboarding_done: true, updated_at: new Date().toISOString() },
    { onConflict: 'family_id' }
  )
  console.log('Aufgeräumt: Soja wieder entfernt')
}

await supabase.auth.signOut()

console.log('\n=== ERGEBNIS ===')
if (hadSoja) {
  console.log('⚠️  Soja war bereits gesetzt — kein Schreibtest möglich, Supabase-Lese-Test aber OK')
} else if (sojaGespeichert) {
  console.log('✅ PASS: Soja in Supabase gespeichert — saveFamilyProfile mit .upsert() funktioniert')
} else if (sojaCount === 0) {
  console.log('⚠️  Soja-Button nicht gefunden — Wizard-Navigation prüfen')
} else {
  console.log('❌ FAIL: Soja markiert aber nicht in Supabase angekommen')
}
