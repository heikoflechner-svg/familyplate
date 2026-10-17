import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const KATEGORIEN = ['Pasta', 'Fleisch', 'Fisch', 'Vegetarisch', 'Vegan', 'Suppe', 'Salat', 'Auflauf', 'Eintopf', 'Snack', 'Frühstück', 'Dessert', 'Sonstiges']

type ZutatLike = { name?: string }

export async function POST(req: NextRequest) {
  const { name, zutaten } = await req.json() as { name?: string; zutaten?: ZutatLike[] }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !name) return NextResponse.json({ kategorie: 'Sonstiges' })

  const hauptzutaten = (zutaten ?? []).slice(0, 5).map(z => z.name ?? '').filter(Boolean).join(', ')
  const prompt = `Kategorisiere dieses Rezept. Wähle NUR EINE Kategorie aus dieser Liste: ${KATEGORIEN.join(', ')}.
Rezept: "${name}"${hauptzutaten ? `\nHauptzutaten: ${hauptzutaten}` : ''}
Antworte NUR mit der Kategorie, ohne weiteren Text.`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 20, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await resp.json() as { content?: Array<{ text?: string }> }
    const text = (data?.content?.[0]?.text ?? '').trim()
    const found = KATEGORIEN.find(k => text.includes(k))
    return NextResponse.json({ kategorie: found ?? 'Sonstiges' })
  } catch {
    return NextResponse.json({ kategorie: 'Sonstiges' })
  }
}
