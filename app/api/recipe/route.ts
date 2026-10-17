import { NextRequest, NextResponse } from 'next/server'
import { checkAllergens, buildAllergenRetryHint } from '../../../lib/allergenCheck'

export const maxDuration = 60

const FALLBACK = {
  name: 'Hähnchen-Pasta',
  zutaten: [
    { menge: '400g', name: 'Hähnchenfilets', typ: 'tiefkühl' },
    { menge: '250g', name: 'Spaghetti', typ: 'speisekammer' },
    { menge: '1 Dose (400g)', name: 'Tomaten (stückig)', typ: 'speisekammer' },
    { menge: '1 Zehe', name: 'Knoblauch', typ: 'grundvorrat' },
    { menge: '2 EL', name: 'Olivenöl', typ: 'grundvorrat' },
    { menge: '1 TL', name: 'Salz', typ: 'grundvorrat' },
    { menge: '½ TL', name: 'Pfeffer', typ: 'grundvorrat' },
    { menge: '1 TL', name: 'getrockneter Oregano', typ: 'grundvorrat' },
  ],
  schritte: [
    'Hähnchen auftauen, trocken tupfen und in 2 cm große Würfel schneiden.',
    'Salzwasser zum Kochen bringen, Pasta nach Packungsanweisung (ca. 10 Min.) kochen.',
    'Knoblauch fein hacken. Hähnchen mit Salz und Pfeffer würzen.',
    'Olivenöl in einer Pfanne erhitzen, Hähnchen bei mittlerer Hitze 5–6 Min. goldbraun anbraten.',
    'Knoblauch dazugeben, 1 Min. mitbraten.',
    'Tomaten und Oregano hinzufügen, Sauce 10 Min. bei niedriger Hitze einköcheln lassen.',
    'Pasta abgießen, mit der Sauce vermengen und sofort servieren.',
  ],
  minuten: 30,
  schwierigkeit: 'Einfach',
}

const MODEL_SONNET = 'claude-sonnet-4-6'
const MODEL_HAIKU  = 'claude-haiku-4-5'

async function callClaude(apiKey: string, prompt: string, maxTokens = 2000, model = MODEL_HAIKU): Promise<string | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await resp.json()
  // Find the first text block explicitly (guards against thinking blocks appearing first)
  const textBlock = (data?.content as { type: string; text?: string }[] | undefined)?.find(b => b.type === 'text')
  return textBlock?.text ?? null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY

  // ── Rescale-Modus: nur Mengen anpassen ──────────────────────────────────
  if (body.mode === 'rescale') {
    const { existingZutaten, oldPersonCount, newPersonCount } = body as {
      existingZutaten: { menge: string; name: string; typ: string }[]
      oldPersonCount: number
      newPersonCount: number
    }
    if (!apiKey) return NextResponse.json({ zutaten: existingZutaten })
    const rescalePrompt = `Skaliere diese Zutatenliste von ${oldPersonCount} auf ${newPersonCount} Person${newPersonCount === 1 ? '' : 'en'}. Behalte EXAKT: Zutatennamen, typ-Werte, Reihenfolge. Runde auf sinnvolle Küchenmaße (z.B. 400g statt 333g, 1 EL statt 0.75 EL, 1 Dose statt 0.83 Dose). Mengen wie "nach Geschmack" bleiben unverändert.
Eingabe: ${JSON.stringify(existingZutaten)}
Antworte NUR als reines JSON-Array ohne Markdown: [{"menge":"...","name":"...","typ":"..."},...]`
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await callClaude(apiKey, rescalePrompt, 800)
        if (!raw) continue
        const arrStart = raw.indexOf('[')
        const arrEnd = raw.lastIndexOf(']')
        if (arrStart === -1 || arrEnd === -1) continue
        const parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1))
        if (Array.isArray(parsed) && parsed.length > 0) return NextResponse.json({ zutaten: parsed })
      }
    } catch { /* fall through to original */ }
    return NextResponse.json({ zutaten: existingZutaten })
  }

  // ── Anpassen-Modus: bestehendes Rezept gezielt ändern ───────────────────
  if (body.mode === 'adjust') {
    const { gericht, existingRezept, wunsch, personCount: adjPC, familyPrompt: adjFP, familyMembersForCheck: adjFM } = body as {
      gericht: string; existingRezept: object; wunsch: string; personCount?: number; familyPrompt?: string
      familyMembersForCheck?: { name: string; allergien: string[] }[]
    }
    if (!apiKey) return NextResponse.json({ rezept: existingRezept, allergieHinweise: [] })
    const familienProfil = adjFP || 'Sabine (keine Nüsse), Heiko (laktosefrei), Tim (kein Fisch)'
    const anzahl = typeof adjPC === 'number' && adjPC > 0 ? adjPC : 4
    const adjustPrompt = `Du bist Rémy. Passe dieses bestehende Rezept für "${gericht}" an.
Gewünschte Änderung: "${wunsch}"
Familie: ${familienProfil}
Bestehendes Rezept: ${JSON.stringify(existingRezept)}

Regeln:
1. Ändere NUR was explizit gewünscht ist – alles andere bleibt identisch.
2. Allergie-Schutz: Zutaten mit "fuer"-Feld sind allergiegerecht angepasst. Widerspricht ein Wunsch einer solchen Anpassung (z.B. "normale Nudeln" bei bestehender glutenfreier Variante), behalte die allergiegerechte Version und schreibe einen deutschen Hinweis in allergieHinweise, z.B. "Für Heiko bleibt die glutenfreie Variante erhalten."
3. Neue Zutaten, die gegen eine Familienunverträglichkeit verstoßen (eine Person kann MEHRERE Unverträglichkeiten haben – alle einzeln prüfen): Behalte die Original-Zutat mit reduzierter Menge für die nicht-betroffenen Personen (Menge × nicht-Betroffene/${anzahl}); füge die allergiegerechte Ersatz-Zutat mit anteiliger Menge für die betroffene Person hinzu (Menge × Betroffene/${anzahl}), setze "fuer":"Name" – PFLICHTFELD. Verwende nur real erhältliche Handelsnamen (z.B. "Mozzarella (laktosefrei)"). Im Zutatennamen nur sachliche Anpassung in Klammern, keinen Personennamen einbauen.
4. Grundvorrat: nur kleine Mengen allgegenwärtiger Vorratsartikel. Hauptzutaten in größerer Menge: "frisch" oder "speisekammer".
5. ${anzahl} Person${anzahl === 1 ? '' : 'en'} – Mengen bei neuen Zutaten passend skalieren.
6. Kein "Schritt N:" am Anfang der Schritte.
7. allergieHinweise: [] wenn kein Konflikt.

Antworte NUR als reines JSON ohne Markdown:
{"rezept":{"name":"${gericht}","emoji":"...","zutaten":[...],"schritte":[...],"minuten":0,"schwierigkeit":"...","ersetzteZutaten":[]},"allergieHinweise":[]}`
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await callClaude(apiKey, adjustPrompt, 2000, MODEL_SONNET)
        if (!raw) continue
        const jsonStart = raw.indexOf('{')
        const jsonEnd = raw.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) continue
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
        const rezept = (parsed.rezept && Array.isArray(parsed.rezept?.zutaten)) ? parsed.rezept
          : Array.isArray(parsed.zutaten) ? parsed
          : null
        if (!rezept) continue

        // Deterministic allergen check + one Rémy retry
        let finalRezept = { ...rezept, rezeptVersion: 2 }
        const adjMembers = adjFM ?? []
        if (adjMembers.length > 0 && Array.isArray(rezept.zutaten)) {
          let issues = checkAllergens(rezept, adjMembers)
          if (issues.length > 0) {
            const retryHint = buildAllergenRetryHint(issues)
            const retryPrompt = `Korrigiere dieses Rezept: fehlende allergiegerechte Alternativen für ${retryHint}.
Aktuelles Rezept: ${JSON.stringify(rezept)}
Ergänze die fehlenden fuer-Zutaten (Original-Zutat mit reduzierter Menge behalten, Ersatz mit "fuer":"Name" hinzufügen). Ändere NICHTS anderes.
Antworte NUR als reines JSON ohne Markdown im Format: {"rezept":{...},"allergieHinweise":[]}`
            const retryRaw = await callClaude(apiKey, retryPrompt, 2000, MODEL_SONNET)
            if (retryRaw) {
              try {
                const rs = retryRaw.indexOf('{'), re = retryRaw.lastIndexOf('}')
                if (rs !== -1 && re !== -1) {
                  const retried = JSON.parse(retryRaw.slice(rs, re + 1))
                  const retriedRezept = retried.rezept ?? (Array.isArray(retried.zutaten) ? retried : null)
                  if (retriedRezept && Array.isArray(retriedRezept.zutaten)) {
                    finalRezept = { ...retriedRezept, rezeptVersion: 2 }
                    issues = checkAllergens(retriedRezept, adjMembers)
                  }
                }
              } catch { /* keep original */ }
            }
          }
        }

        return NextResponse.json({ rezept: finalRezept, allergieHinweise: (parsed.allergieHinweise ?? []) as string[] })
      }
    } catch { /* fall through */ }
    return NextResponse.json({ rezept: existingRezept, allergieHinweise: [] })
  }

  // ── Normal-Modus: vollständiges Rezept generieren ────────────────────────
  const { gericht, emoji, freezerList, pantryList, familyPrompt, personCount, familyMembersForCheck, mahlzeitTyp } = body
  if (!apiKey) {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }

  const familienProfil = familyPrompt || 'Sabine (keine Nüsse), Heiko (laktosefrei), Tim (kein Fisch)'
  const anzahl: number = typeof personCount === 'number' && personCount > 0 ? personCount : 4
  const leichtHinweis = (mahlzeitTyp as string | undefined) === 'leicht'
    ? '\n\nDieses Gericht ist eine leichte Mahlzeit (z.B. Suppe, Salat, Omelett, Ofengemüse, Brotzeit). Wenige Zutaten, max. ca. 20 Minuten, keine aufwändige Vorbereitung. Allergie-Anpassungen (fuer-Felder) vollständig beibehalten.'
    : ''
  const prompt = `Du bist Rémy. Erstelle ein vollständiges Familienrezept für "${gericht}" für ${anzahl} Person${anzahl === 1 ? '' : 'en'}. Verfügbar: Gefriertruhe: ${freezerList || 'variiert'}. Speisekammer: ${pantryList || 'variiert'}. Familie: ${familienProfil}.${leichtHinweis}

WICHTIG: Ändere den Namen des Gerichts NIE. Liste ALLE Zutaten mit genauen Mengen für ${anzahl} Person${anzahl === 1 ? '' : 'en'} auf – inklusive Gewürze, Kräuter, Öl und Aromaten. Unterscheide dabei:
- "frisch": frische Zutaten (Gemüse, Fleisch, Fisch, Milchprodukte, frische Kräuter)
- "tiefkühl": Tiefkühlprodukte
- "speisekammer": Haltbare Zutaten (Nudeln, Reis, Dosentomaten, Mehl, Zucker …)
- "grundvorrat": NUR kleine Mengen allgegenwärtiger Vorratsartikel, die NICHT auf die Einkaufsliste kommen (z.B. 1–2 TL Salz, ½ TL Pfeffer, 1–2 EL Öl/Butter, 1–2 Zehen Knoblauch als Würze, 1 TL getrocknete Gewürze wie Paprika/Oregano/Kreuzkümmel, 1 EL Essig). WICHTIG: Ist eine solche Zutat Hauptbestandteil des Gerichts oder wird sie in größerer Menge benötigt (z.B. 8 Zehen Knoblauch bei Aglio e Olio, viele Zwiebeln für Suppe, viel Butter in einem Buttergebäck), dann "frisch" oder "speisekammer" verwenden – NICHT grundvorrat.
Zubereitung in 5–8 konkreten Schritten mit Zeiten und Temperaturen. Kein "Schritt N:" am Anfang – die Nummerierung erfolgt automatisch in der App.

Abneigungen-Regel: Im Profil steht "mag nicht X" für manche Personen. Gehe pragmatisch vor:
1. Ist die Zutat leicht weglassbar oder nur Beiwerk (z.B. Oliven als Topping, Pilze in einer Pfanne die man am Ende rausnehmen kann): Lass sie für alle weg ODER schreibe in schritte einen kurzen Hinweis wie "Oliven separat in ein Schälchen stellen". Kein fuer-Eintrag nötig.
2. Ist eine einfache Abtrennung ohne zweiten Topf möglich (z.B. Portion vor dem Untermischen abnehmen): Füge einen fuer-Eintrag "ohne [Zutat] (für Name)" mit Menge 0 hinzu, ergänze einen Satz in schritte und trage es in ersetzteZutaten ein.
3. Würde die Anpassung einen zweiten Topf oder aufwändige Parallelzubereitung erfordern: Koche das Gericht normal – kein fuer-Eintrag. Füge stattdessen am Anfang von schritte einen kurzen Hinweis ein, z.B. "Hinweis: Tim mag keine Aubergine – beim Servieren aussortieren."

Allergie-Regel: Prüfe jede Zutat gegen JEDE Unverträglichkeit JEDER anwesenden Person EINZELN – bei MEHREREN Unverträglichkeiten (z.B. Gluten UND Milch) müssen ALLE einzeln geprüft und ALLE nicht verträglichen Zutaten adaptiert werden!
Wenn eine Zutat für eine Person X nicht verträglich ist (X ist eine von ${anzahl} Personen):
a) Behalte die Original-Zutat MIT REDUZIERTER MENGE für die nicht-betroffenen Personen: OriginalMenge × (nicht-betroffene Personen / ${anzahl}). Kein fuer-Feld.
b) Füge die allergiegerechte Ersatz-Zutat als SEPARATEN Eintrag hinzu mit anteiliger Menge: OriginalMenge × (betroffene Personen / ${anzahl}). Setze "fuer":"Name" – PFLICHTFELD, darf niemals fehlen! Verwende ausschließlich real erhältliche Produkte mit gängigen Handelsnamen (z.B. "Mozzarella (laktosefrei)", "Mehl (glutenfrei)", "veganer Käseersatz") – keine erfundenen Bezeichnungen. Im Zutatennamen NUR die sachliche Anpassung in Klammern, NICHT den Personennamen einbauen.
c) Trage die Ersatz-Zutat in ersetzteZutaten ein: "Menge Ersatz-Zutat (für Name)".
d) Wenn separate Zubereitung nötig: ergänze in schritte ausdrücklich, wann und wie die Portion für diese Person getrennt zubereitet wird (eigener Topf/Utensilien, Kreuzkontamination vermeiden).
Betrifft keine Zutat eine Unverträglichkeit: fuer-Felder komplett weglassen, ersetzteZutaten auf [].

Antworte NUR als reines JSON ohne Markdown-Codeblock:
{"name":"${gericht}","emoji":"${emoji || '🍽'}","zutaten":[{"menge":"400g","name":"...","typ":"frisch"},{"menge":"222g","name":"Weizenmehl","typ":"speisekammer"},{"menge":"111g","name":"Mehl (glutenfrei)","typ":"speisekammer","fuer":"Heiko"},{"menge":"222g","name":"Mozzarella","typ":"frisch"},{"menge":"111g","name":"Mozzarella (laktosefrei)","typ":"frisch","fuer":"Heiko"},{"menge":"1 TL","name":"Salz","typ":"grundvorrat"}],"schritte":["(5 Min.) ...","(10 Min.) ...","(2 Min.) Heikos Portion mit glutenfreiem Mehl und laktosefreiem Mozzarella separat zubereiten (Kreuzkontamination vermeiden)."],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":["111g Mehl (glutenfrei) (für Heiko)","111g Mozzarella (laktosefrei) (für Heiko)"]}`

  try {
    const raw = await callClaude(apiKey, prompt, 2000, MODEL_SONNET)
    if (!raw) throw new Error('No content')
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found')
    let parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))

    // Deterministic allergen check + one Rémy retry
    const members = (familyMembersForCheck as { name: string; allergien: string[] }[] | undefined) ?? []
    if (members.length > 0 && Array.isArray(parsed.zutaten)) {
      let issues = checkAllergens(parsed, members)
      if (issues.length > 0) {
        const retryHint = buildAllergenRetryHint(issues)
        const retryPrompt = `Korrigiere dieses Rezept: fehlende allergiegerechte Alternativen für ${retryHint}.
Aktuelles Rezept: ${JSON.stringify(parsed)}
Ergänze die fehlenden fuer-Zutaten (Original-Zutat mit reduzierter Menge behalten, Ersatz mit "fuer":"Name" hinzufügen). Ändere NICHTS anderes.
Antworte NUR als reines JSON ohne Markdown.`
        const retryRaw = await callClaude(apiKey, retryPrompt, 2000, MODEL_SONNET)
        if (retryRaw) {
          try {
            const rs = retryRaw.indexOf('{'), re = retryRaw.lastIndexOf('}')
            if (rs !== -1 && re !== -1) {
              const retried = JSON.parse(retryRaw.slice(rs, re + 1))
              if (Array.isArray(retried?.zutaten)) {
                parsed = retried
                issues = checkAllergens(retried, members)
              }
            }
          } catch { /* keep original */ }
        }
      }
    }

    return NextResponse.json({ rezept: { ...parsed, rezeptVersion: 2 } })
  } catch {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }
}
