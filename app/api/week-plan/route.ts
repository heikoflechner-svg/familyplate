import { NextRequest, NextResponse } from 'next/server'

const FB_MITTAG = [
  { e: '🥗', g: 'Reste vom Vortag', m: 10, q: 'kuehlschrank' },
  { e: '🥪', g: 'Belegte Brote', m: 10, q: 'frisch' },
  { e: '🍜', g: 'Nudelsuppe', m: 15, q: 'speisekammer' },
  { e: '🥙', g: 'Wraps', m: 15, q: 'frisch' },
  { e: '🥗', g: 'Salat', m: 10, q: 'frisch' },
  { e: '🍳', g: 'Eierspeise', m: 10, q: 'frisch' },
  { e: '🥣', g: 'Eintopf aufgewärmt', m: 10, q: 'kuehlschrank' },
]
const FB_ABEND = [
  { e: '🥗', g: 'Lasagne', m: 15, q: 'gefriertruhe' },
  { e: '🍗', g: 'Hähnchen-Pasta', m: 30, q: 'gefriertruhe' },
  { e: '🍲', g: 'Gemüsecurry', m: 15, q: 'gefriertruhe' },
  { e: '🍕', g: 'Selbstgemachte Pizza', m: 40, q: 'frisch' },
  { e: '🐟', g: 'Lachs mit Reis', m: 25, q: 'gefriertruhe' },
  { e: '🌮', g: 'Tacos', m: 25, q: 'frisch' },
  { e: '🍝', g: 'Spaghetti Bolognese', m: 35, q: 'frisch' },
]

export async function POST(req: NextRequest) {
  const { planMittag, planWE, freezerList, pantryList, behaltene, neuTage } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  const tage = planWE
    ? ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
    : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const planTage = neuTage?.length ? neuTage : tage
  const slotHinweis = planMittag ? 'Mittag UND Abend' : 'nur Abend'
  const chefRota = ['PA', 'MA', 'TI', 'TI']

  if (!apiKey) {
    const fallback: object[] = []
    planTage.forEach((t: string, i: number) => {
      if (planMittag) {
        const fm = FB_MITTAG[i % FB_MITTAG.length]
        fallback.push({ tag: t, slot: 'Mittag', emoji: fm.e, gericht: fm.g, minuten: fm.m, quelle: fm.q, chef: chefRota[i % 4] })
      }
      const fa = FB_ABEND[i % FB_ABEND.length]
      fallback.push({ tag: t, slot: 'Abend', emoji: fa.e, gericht: fa.g, minuten: fa.m, quelle: fa.q, chef: chefRota[(i + 1) % 4] })
    })
    const result = [...(behaltene || []), ...fallback]
    return NextResponse.json({ woche: result })
  }

  const beispiele: string[] = []
  planTage.forEach((t: string, i: number) => {
    if (planMittag) beispiele.push(`{"tag":"${t}","slot":"Mittag","emoji":"...","gericht":"...","minuten":20,"quelle":"frisch","chef":"${chefRota[i % 4]}"}`)
    beispiele.push(`{"tag":"${t}","slot":"Abend","emoji":"...","gericht":"...","minuten":30,"quelle":"frisch","chef":"${chefRota[(i + 1) % 4]}"}`)
  })

  const prompt = `Du bist Rémy. Plane ${slotHinweis} für ${planTage.join(', ')} für Familie Flechner. Profil: Sabine (MA) keine Nüsse mag Fisch, Heiko (PA) laktosefrei mag Pasta, Tim (TI) kein Fisch mag Nudeln. Gefriertruhe: ${freezerList}. Speisekammer: ${pantryList}. Nutze Gefriertruhe/Speisekammer wenn sinnvoll. Weise pro Tag+Slot Küchenchef zu (MA PA TI) nach Fairness. Antworte NUR als JSON: {"woche":[${beispiele.join(',')}]}`

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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const parsed = JSON.parse(data.content[0].text)
    const result = [...(behaltene || []), ...parsed.woche]
    return NextResponse.json({ woche: result })
  } catch {
    const fallback: object[] = []
    planTage.forEach((t: string, i: number) => {
      if (planMittag) {
        const fm = FB_MITTAG[i % FB_MITTAG.length]
        fallback.push({ tag: t, slot: 'Mittag', emoji: fm.e, gericht: fm.g, minuten: fm.m, quelle: fm.q, chef: chefRota[i % 4] })
      }
      const fa = FB_ABEND[i % FB_ABEND.length]
      fallback.push({ tag: t, slot: 'Abend', emoji: fa.e, gericht: fa.g, minuten: fa.m, quelle: fa.q, chef: chefRota[(i + 1) % 4] })
    })
    return NextResponse.json({ woche: [...(behaltene || []), ...fallback] })
  }
}
