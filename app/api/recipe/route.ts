import { NextRequest, NextResponse } from 'next/server'

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

async function callClaude(apiKey: string, prompt: string, maxTokens = 2000): Promise<string | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await resp.json()
  return data?.content?.[0]?.text ?? null
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
    const { gericht, existingRezept, wunsch, personCount: adjPC, familyPrompt: adjFP } = body as {
      gericht: string; existingRezept: object; wunsch: string; personCount?: number; familyPrompt?: string
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
3. Neue Zutaten, die gegen eine Familienunverträglichkeit verstoßen: allergiegerechte Version eintragen mit "fuer":"Name".
4. Grundvorrat: nur kleine Mengen allgegenwärtiger Vorratsartikel. Hauptzutaten in größerer Menge: "frisch" oder "speisekammer".
5. ${anzahl} Person${anzahl === 1 ? '' : 'en'} – Mengen bei neuen Zutaten passend skalieren.
6. Kein "Schritt N:" am Anfang der Schritte.
7. allergieHinweise: [] wenn kein Konflikt.

Antworte NUR als reines JSON ohne Markdown:
{"rezept":{"name":"${gericht}","emoji":"...","zutaten":[...],"schritte":[...],"minuten":0,"schwierigkeit":"...","ersetzteZutaten":[]},"allergieHinweise":[]}`
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await callClaude(apiKey, adjustPrompt)
        if (!raw) continue
        const jsonStart = raw.indexOf('{')
        const jsonEnd = raw.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) continue
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
        const rezept = (parsed.rezept && Array.isArray(parsed.rezept?.zutaten)) ? parsed.rezept
          : Array.isArray(parsed.zutaten) ? parsed
          : null
        if (!rezept) continue
        return NextResponse.json({ rezept, allergieHinweise: (parsed.allergieHinweise ?? []) as string[] })
      }
    } catch { /* fall through */ }
    return NextResponse.json({ rezept: existingRezept, allergieHinweise: [] })
  }

  // ── Normal-Modus: vollständiges Rezept generieren ────────────────────────
  const { gericht, emoji, freezerList, pantryList, familyPrompt, personCount } = body
  if (!apiKey) {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }

  const familienProfil = familyPrompt || 'Sabine (keine Nüsse), Heiko (laktosefrei), Tim (kein Fisch)'
  const anzahl: number = typeof personCount === 'number' && personCount > 0 ? personCount : 4
  const prompt = `Du bist Rémy. Erstelle ein vollständiges Familienrezept für "${gericht}" für ${anzahl} Person${anzahl === 1 ? '' : 'en'}. Verfügbar: Gefriertruhe: ${freezerList || 'variiert'}. Speisekammer: ${pantryList || 'variiert'}. Familie: ${familienProfil}.

WICHTIG: Ändere den Namen des Gerichts NIE. Liste ALLE Zutaten mit genauen Mengen für ${anzahl} Person${anzahl === 1 ? '' : 'en'} auf – inklusive Gewürze, Kräuter, Öl und Aromaten. Unterscheide dabei:
- "frisch": frische Zutaten (Gemüse, Fleisch, Fisch, Milchprodukte, frische Kräuter)
- "tiefkühl": Tiefkühlprodukte
- "speisekammer": Haltbare Zutaten (Nudeln, Reis, Dosentomaten, Mehl, Zucker …)
- "grundvorrat": NUR kleine Mengen allgegenwärtiger Vorratsartikel, die NICHT auf die Einkaufsliste kommen (z.B. 1–2 TL Salz, ½ TL Pfeffer, 1–2 EL Öl/Butter, 1–2 Zehen Knoblauch als Würze, 1 TL getrocknete Gewürze wie Paprika/Oregano/Kreuzkümmel, 1 EL Essig). WICHTIG: Ist eine solche Zutat Hauptbestandteil des Gerichts oder wird sie in größerer Menge benötigt (z.B. 8 Zehen Knoblauch bei Aglio e Olio, viele Zwiebeln für Suppe, viel Butter in einem Buttergebäck), dann "frisch" oder "speisekammer" verwenden – NICHT grundvorrat.
Zubereitung in 5–8 konkreten Schritten mit Zeiten und Temperaturen. Kein "Schritt N:" am Anfang – die Nummerierung erfolgt automatisch in der App.

Allergie-Regel: Prüfe jede Zutat gegen die Unverträglichkeiten der Familienmitglieder (Daten in "Familie:" oben).
Wenn eine Zutat gegen eine Unverträglichkeit verstößt: Ersetze sie DIREKT in zutaten durch die allergiegerechte Version (kein Original-Eintrag) und setze das Feld "fuer":"Name" auf dieser Zutat. Im Zutatennamen NUR die sachliche Anpassung nennen (z.B. "Spaghetti (glutenfrei)"), NICHT den Personennamen einbauen (also NICHT "Spaghetti (glutenfrei für Heiko)"). Trage sie zusätzlich in ersetzteZutaten ein als "Menge Ersatz-Zutat (für Name)" (für den Wochenplan-Hinweis).
Wenn eine allergiegerechte Zutat separat zubereitet werden muss (z.B. glutenfreie Nudeln in eigenem Topf): Ergänze in den schritte-Texten ausdrücklich, wann und wie die Portion für diese Person getrennt zubereitet wird – eigener Topf/Pfanne/Utensilien, Hinweis auf Kreuzkontamination vermeiden, und an welchem Schritt die Portion separat angerichtet wird.
Betrifft keine Zutat eine Unverträglichkeit: fuer-Felder komplett weglassen, ersetzteZutaten auf [].

Antworte NUR als reines JSON ohne Markdown-Codeblock:
{"name":"${gericht}","emoji":"${emoji || '🍽'}","zutaten":[{"menge":"400g","name":"...","typ":"frisch"},{"menge":"500g","name":"... (glutenfrei)","typ":"speisekammer","fuer":"Heiko"},{"menge":"1 TL","name":"Salz","typ":"grundvorrat"}],"schritte":["(5 Min.) ...","(10 Min.) ...","(2 Min.) Portion für Heiko separat in eigenem Topf kochen (Kreuzkontamination vermeiden), dann separat anrichten."],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":["500g ... (glutenfrei) (für Heiko)"]}`

  try {
    const raw = await callClaude(apiKey, prompt)
    if (!raw) throw new Error('No content')
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found')
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
    return NextResponse.json({ rezept: parsed })
  } catch {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }
}
