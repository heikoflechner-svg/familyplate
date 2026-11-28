import type { Rezeptzutat } from './state'

/**
 * Entfernt allergen-spezifische Präfixe und Suffixe aus einem Zutatennamen,
 * um den Basis-Namen für die Paarung (Original ↔ Ersatz) zu ermitteln.
 * Verarbeitet sowohl Adjektiv-Präfixe ("glutenfreier Mehl") als auch
 * Klammer-Suffixe ("Mehl (glutenfrei)").
 */
export function getAllergenBaseName(name: string): string {
  let n = name.trim()
  // Klammer-Suffixe entfernen: "(glutenfrei)", "(laktosefrei)", "(ohne Laktose)" usw.
  n = n.replace(
    /\s*\((glutenfrei|laktosefrei|milchfrei|eifrei|sojafrei|nussfrei|weizenfrei|vegan|ohne laktose|ohne gluten|ohne milch|ohne ei|ohne soja|ohne nüsse|ohne weizen|laktosefrei und glutenfrei)[^)]*\)/gi,
    '',
  ).trim()
  // Adjektiv-Präfixe entfernen: "glutenfreie(r/s/m/n) " am Anfang
  n = n.replace(
    /^(glutenfrei|laktosefrei|milchfrei|eifrei|sojafrei|nussfrei|weizenfrei|vegan)(e[rsmen]?\s)/gi,
    '',
  ).trim()
  // "ohne X " Präfixe: "ohne Laktose ", "ohne Gluten " usw.
  n = n.replace(/^ohne\s+(laktose|gluten|milch|ei|soja|nüsse|weizen)\s+/gi, '').trim()
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : n
}

function parseMengeFixed(menge: string): { amount: number; suffix: string } | null {
  const m = menge.trim()
  const match = m.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (!match) return null
  const amount = parseFloat(match[1].replace(',', '.'))
  if (!isFinite(amount) || amount <= 0) return null
  return { amount, suffix: match[2].trim() }
}

function formatMengeFixed(amount: number, suffix: string): string {
  const rounded = Math.round(amount * 10) / 10
  const str = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
  return suffix ? `${str} ${suffix}` : str
}

/**
 * Korrigiert die Mengen von fuer-Zutaten (Allergen-Ersatz) deterministisch.
 * Rémy berechnet fuer-Mengen manchmal falsch – diese Funktion fixiert sie
 * basierend auf der no-fuer-Menge (die als korrekt angenommen wird).
 *
 * Formel (n = anzahl, k = betroffene Personen für diesen Zutaten-Typ):
 *   total   = X.menge × n / (n − k)
 *   Y.menge = total / n  (= X.menge / (n − k), für jedes einzelne fuer-Item, das 1 Person repräsentiert)
 *
 * Bei k = 0 oder n − k = 0: nichts tun.
 * Paarung: zuerst über "ersetzt"-Feld, dann über getAllergenBaseName-Matching.
 * Einheitenkonflikt: Items nur korrigieren wenn no-fuer und fuer dieselbe Einheit haben.
 */
export function fixAllergenPairQuantities(
  zutaten: Rezeptzutat[],
  anzahl: number,
): { zutaten: Rezeptzutat[]; changed: boolean } {
  if (anzahl <= 1) return { zutaten, changed: false }

  type PairInfo = { noFuerIdx: number; fuerIdxs: number[] }
  const pairs = new Map<string, PairInfo>()

  // Sammle alle fuer-Zutaten und ihre Basis-Schlüssel
  for (let i = 0; i < zutaten.length; i++) {
    const z = zutaten[i]
    if (!z.fuer) continue
    const baseKey = (z.ersetzt ?? getAllergenBaseName(z.name)).toLowerCase().trim()
    if (!baseKey) continue
    if (!pairs.has(baseKey)) pairs.set(baseKey, { noFuerIdx: -1, fuerIdxs: [] })
    pairs.get(baseKey)!.fuerIdxs.push(i)
  }

  if (pairs.size === 0) return { zutaten, changed: false }

  // Finde no-fuer-Partner für jede Gruppe
  for (let i = 0; i < zutaten.length; i++) {
    const z = zutaten[i]
    if (z.fuer) continue
    const baseName = getAllergenBaseName(z.name).toLowerCase().trim()
    const exactKey = z.name.toLowerCase().trim()
    if (pairs.has(baseName)) {
      pairs.get(baseName)!.noFuerIdx = i
    } else if (pairs.has(exactKey)) {
      pairs.get(exactKey)!.noFuerIdx = i
    }
  }

  const result = [...zutaten]
  let changed = false

  for (const [baseKey, { noFuerIdx, fuerIdxs }] of pairs) {
    if (noFuerIdx === -1) {
      console.info('[fixAllergen] kein no-fuer-Partner gefunden für', baseKey)
      continue
    }
    const k = fuerIdxs.length
    if (k === 0 || anzahl <= k) continue // n - k = 0 oder k = 0: nichts tun

    const noFuerZ = result[noFuerIdx]
    const noFuerParsed = parseMengeFixed(noFuerZ.menge)
    if (!noFuerParsed) continue

    // Jedes fuer-Item repräsentiert 1 Person → perPersonMenge = noFuerMenge / (n - k)
    const perPerson = noFuerParsed.amount / (anzahl - k)

    for (const fuerIdx of fuerIdxs) {
      const fuerZ = result[fuerIdx]
      const fuerParsed = parseMengeFixed(fuerZ.menge)
      if (!fuerParsed) continue
      // Nur korrigieren wenn gleiche Einheit
      if (fuerParsed.suffix.toLowerCase() !== noFuerParsed.suffix.toLowerCase()) continue
      const roundedExpected = Math.round(perPerson * 10) / 10
      const roundedActual = Math.round(fuerParsed.amount * 10) / 10
      if (Math.abs(roundedActual - roundedExpected) < 0.05) continue // bereits korrekt
      const newMenge = formatMengeFixed(perPerson, noFuerParsed.suffix)
      console.info('[fixAllergen]', fuerZ.name, 'fuer', fuerZ.fuer,
        `${noFuerZ.menge}/(${anzahl}-${k}) = ${newMenge}`, `(war: ${fuerZ.menge})`)
      result[fuerIdx] = { ...fuerZ, menge: newMenge }
      changed = true
    }
  }

  return { zutaten: result, changed }
}
