import { NextRequest, NextResponse } from 'next/server'

const FALLBACK = [
  { emoji: '🐟', name: 'Lachs-Pasta', info: 'Sabine + Tim · Regional · aus Gefriertruhe', minuten: 25 },
  { emoji: '🍗', name: 'Hähnchen mit Pasta', info: 'Hühnerfilets aus Gefriertruhe · Spaghetti vorhanden', minuten: 30 },
  { emoji: '🍕', name: 'Selbstgemachte Pizza', info: 'Tims Wunsch · alle machen mit', minuten: 40 },
]

export async function POST(req: NextRequest) {
  const { wishes, zustimmungen, choDay, choSlot, freezerList, pantryList } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ vorschlaege: FALLBACK })
  }

  type WishJSON = { person: string; kind: string; text?: string; dishName?: string; emoji?: string }
  const wishText = wishes?.length
    ? wishes.map((w: WishJSON) =>
        `${w.person}: ${w.kind === 'text' ? w.text : `${w.emoji} ${w.dishName}`}`
      ).join(', ')
    : 'offen'
  const zustText = zustimmungen?.length
    ? 'Zustimmungen: ' + zustimmungen.join(', ') + '.'
    : ''

  const prompt = `Du bist Rémy, ein freundlicher KI-Kochassistent für Familien. Familie plant ${choSlot || 'Abend'} am ${choDay || 'heute'}. Wünsche: ${wishText}. ${zustText} Allergien: Sabine keine Nüsse, Heiko laktosefrei, Tim kein Fisch. Speisekammer: ${pantryList || 'Spaghetti, Reis, Tomatensoße'}. Gefriertruhe: ${freezerList || 'Hühnerfilets, Lachs'}. Schlage 3 Kompromiss-Gerichte vor. Antworte NUR als JSON ohne Markdown: {"vorschlaege":[{"emoji":"...","name":"...","info":"...","minuten":25},{"emoji":"...","name":"...","info":"...","minuten":30},{"emoji":"...","name":"...","info":"...","minuten":40}]}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const parsed = JSON.parse(data.content[0].text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ vorschlaege: FALLBACK })
  }
}
