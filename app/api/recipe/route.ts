import { NextRequest, NextResponse } from 'next/server'

const FALLBACK = {
  name: 'Hähnchen-Pasta',
  zutaten: [
    { menge: '400g', name: 'Hähnchenfilets (aus Gefriertruhe)', typ: 'tiefkühl' },
    { menge: '250g', name: 'Spaghetti', typ: 'speisekammer' },
    { menge: '1 Dose', name: 'Tomaten (stückig)', typ: 'speisekammer' },
    { menge: '1 Zehe', name: 'Knoblauch', typ: 'frisch' },
    { menge: 'nach Geschmack', name: 'Olivenöl, Salz, Pfeffer', typ: 'frisch' },
  ],
  schritte: [
    'Hähnchen auftauen und in Würfel schneiden.',
    'Pasta nach Packungsanweisung kochen.',
    'Hähnchen in Öl anbraten, Knoblauch dazugeben.',
    'Tomaten hinzufügen, 10 Min. köcheln lassen.',
    'Mit Pasta servieren.',
  ],
  minuten: 30,
  schwierigkeit: 'Einfach',
}

export async function POST(req: NextRequest) {
  const { gericht, emoji, freezerList, pantryList, familyPrompt } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }

  const familienProfil = familyPrompt || 'Sabine (keine Nüsse), Heiko (laktosefrei), Tim (kein Fisch)'
  const prompt = `Du bist Rémy. Erstelle ein einfaches Familienrezept für "${gericht}". Verfügbar: Gefriertruhe: ${freezerList || 'variiert'}. Speisekammer: ${pantryList || 'variiert'}. Familie: ${familienProfil}. WICHTIG: Wähle das normale Gericht – ändere den Namen nie. Wenn eine Zutat gegen eine Unverträglichkeit verstößt (z.B. normaler Teig enthält Gluten für Heiko), trag die benötigte Ersatz-Zutat in ersetzteZutaten ein als "Menge Zutat (für Person)", z.B. "1 Packung glutenfreier Teig (für Heiko)". Wenn keine Unverträglichkeit betroffen ist, setze ersetzteZutaten auf []. Kurzes Rezept: max. 4 Zutaten, max. 3 Schritte. Antworte NUR als reines JSON ohne Markdown-Codeblock: {"name":"${gericht}","emoji":"${emoji || '🍽'}","zutaten":[{"menge":"200g","name":"...","typ":"frisch"}],"schritte":["Schritt 1..."],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":["1 Packung glutenfreier Teig (für Heiko)"]}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    if (!data?.content?.[0]?.text) throw new Error('No content in response')
    const raw = data.content[0].text as string
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found')
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
    return NextResponse.json({ rezept: parsed })
  } catch {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }
}
