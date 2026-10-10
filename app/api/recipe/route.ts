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
- "grundvorrat": Zutaten die praktisch jeder zu Hause hat und die NICHT auf die Einkaufsliste kommen (Salz, Pfeffer, Öl, Butter, Knoblauch, Zwiebeln, gängige Gewürze wie Paprika/Oregano/Kreuzkümmel, Essig, Zitronensaft). Diese im Rezept aufführen, aber NICHT einkaufen.
Zubereitung in 5–8 konkreten Schritten mit Zeiten und Temperaturen.

Allergie-Regel: Wenn eine Zutat gegen eine Unverträglichkeit verstößt (z.B. Gluten für Heiko, Nüsse für Sabine, Fisch für Tim), trag NUR die nötige Ersatz-Zutat in ersetzteZutaten ein als "Menge Zutat (für Person)", z.B. "1 Packung glutenfreier Teig (für Heiko)". Betrifft keine Zutat eine Unverträglichkeit, setze ersetzteZutaten auf [].

Antworte NUR als reines JSON ohne Markdown-Codeblock:
{"name":"${gericht}","emoji":"${emoji || '🍽'}","zutaten":[{"menge":"400g","name":"...","typ":"frisch"},{"menge":"1 TL","name":"Salz","typ":"grundvorrat"}],"schritte":["Schritt 1 (5 Min.)..."],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":[]}`

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
