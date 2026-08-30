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
  const prompt = `Du bist Rémy. Erstelle ein einfaches Familienrezept für "${gericht}". Verfügbar: Gefriertruhe: ${freezerList || 'variiert'}. Speisekammer: ${pantryList || 'variiert'}. Familie: ${familienProfil}. WICHTIG: Ersetze alle Zutaten, die gegen eine genannte Unverträglichkeit verstoßen, durch passende Alternativen (z.B. Weizenmehl → glutenfreies Mehl, Kuhmilch → Laktosefreie Milch, normale Pasta → glutenfreie Pasta). Behalte das Gericht bei – passe nur die betroffene Zutat an. Wenn Zutaten ersetzt wurden, liste sie in ersetzteZutaten als ["Original → Ersatz (für Person)"]. Wenn keine Ersetzung nötig war, setze ersetzteZutaten auf []. Antworte NUR als JSON ohne Markdown: {"name":"${gericht}","emoji":"${emoji || '🍽'}","zutaten":[{"menge":"200g","name":"...","typ":"frisch"}],"schritte":["Schritt 1...","Schritt 2..."],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":["Original → Ersatz (für Person)"]}`

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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const parsed = JSON.parse(data.content[0].text)
    return NextResponse.json({ rezept: parsed })
  } catch {
    return NextResponse.json({ rezept: { ...FALLBACK, name: gericht || FALLBACK.name, emoji: emoji || '🍗' } })
  }
}
