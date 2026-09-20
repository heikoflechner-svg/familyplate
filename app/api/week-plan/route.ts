import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

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


type WishJSON = { person: string; tag: string; slot: string; type: string; text?: string; dishName?: string; emoji?: string }

// Findet das erste vollständige {…}-Objekt im Text (Klammer-Tiefenzähler).
// Robuster als indexOf/lastIndexOf: stoppt sobald die Tiefe wieder 0 erreicht,
// ignoriert damit Denktext der NACH dem JSON erscheint.
function extractFirstJson(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\' && inString) { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return raw.slice(start, i + 1) }
  }
  return null
}

export async function POST(req: NextRequest) {
  const { mittagsloseTage, planWE, freezerList, pantryList, behaltene, neuTage, wishes, familyPrompt, lastDishes, gaesteProTag } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('[week-plan] apiKey present:', !!apiKey, '| length:', apiKey?.length ?? 0)

  const tage = planWE
    ? ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
    : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const planTage = neuTage?.length ? neuTage : tage
  const mittagslosSet = new Set<string>(mittagsloseTage ?? [])
  const hasMittag = (tag: string) => !mittagslosSet.has(tag)
  const mittagTage = planTage.filter((t: string) => hasMittag(t))
  const slotHinweis = mittagTage.length === 0
    ? 'nur Abend'
    : mittagTage.length === planTage.length
      ? 'Mittag UND Abend'
      : `Mittag UND Abend (Mittag nur an: ${mittagTage.join(', ')})`
  const chefRota = ['PA', 'MA', 'TI', 'TI']

  if (!apiKey) {
    const fallback: object[] = []
    planTage.forEach((t: string, i: number) => {
      if (hasMittag(t)) {
        const fm = FB_MITTAG[i % FB_MITTAG.length]
        fallback.push({ tag: t, slot: 'Mittag', emoji: fm.e, gericht: fm.g, minuten: fm.m, quelle: fm.q, chef: chefRota[i % 4] })
      }
      const fa = FB_ABEND[i % FB_ABEND.length]
      fallback.push({ tag: t, slot: 'Abend', emoji: fa.e, gericht: fa.g, minuten: fa.m, quelle: fa.q, chef: chefRota[(i + 1) % 4] })
    })
    const result = [...(behaltene || []), ...fallback]
    return NextResponse.json({ woche: result, allergie: {} })
  }

  const beispiele: string[] = []
  planTage.forEach((t: string, i: number) => {
    if (hasMittag(t)) beispiele.push(`{"tag":"${t}","slot":"Mittag","emoji":"...","gericht":"...","minuten":20,"quelle":"frisch","chef":"${chefRota[i % 4]}"}`)
    beispiele.push(`{"tag":"${t}","slot":"Abend","emoji":"...","gericht":"...","minuten":30,"quelle":"frisch","chef":"${chefRota[(i + 1) % 4]}"}`)
  })

  const wishList = (wishes ?? []) as WishJSON[]
  const wishHinweis = wishList.length
    ? ` Familienwünsche (bitte berücksichtigen): ${wishList.map(w => `${w.person} (${w.tag} ${w.slot === 'Mittag' ? '🌞' : '🌙'}): ${w.type === 'ergaenzung' ? `Notiz: ${w.text}` : `Alternative: ${w.emoji ?? ''} ${w.dishName ?? ''}`}`).join(', ')}.`
    : ''
  const lastDishesList = (lastDishes as string[] | undefined | null) ?? []
  const historyHinweis = lastDishesList.length > 0
    ? ` Bitte diese Gerichte diese Woche NICHT wiederholen (letzte Wochen): ${lastDishesList.join(', ')}.`
    : ''
  const behalteneList = Array.isArray(behaltene) ? (behaltene as { gericht: string }[]) : []
  const behalteneHinweis = behalteneList.length > 0
    ? ` Bereits fest geplant (bitte nicht nochmals wählen): ${behalteneList.map(e => e.gericht).filter(Boolean).join(', ')}.`
    : ''
  const gaesteList = (gaesteProTag as Array<{ tag: string; gaeste: number }> | undefined | null) ?? []
  const gaesteHinweis = gaesteList.length > 0
    ? ` Gäste: ${gaesteList.map(g => `am ${g.tag} kommen ${g.gaeste} zusätzliche${g.gaeste === 1 ? 'r Gast' : ' Gäste'}`).join(', ')} – bitte an diesen Tagen gut skalierbare Gerichte einplanen, die sich einfach für mehr Personen zubereiten lassen.`
    : ''

  const familienProfil = familyPrompt || 'Sabine (MA) keine Nüsse mag Fisch, Heiko (PA) laktosefrei mag Pasta, Tim (TI) kein Fisch mag Nudeln'
  console.log('[week-plan] familyPrompt:', familienProfil)
  console.log('[week-plan] lastDishes:', lastDishesList.length, 'Einträge')
  console.log('[week-plan] gaesteProTag:', gaesteList.length, 'Tage mit Gästen')
  const allergenCheck = 'SCHRITT 2 – Allergen-Check (nach der Auswahl): Prüfe für jedes gewählte Gericht, ob Zutaten eine Unverträglichkeit aus dem Profil verletzen. Quellen: Gluten=Mehl/Pasta/Brot/Pizzateig/Paniermehl. Kasein=Milch/Käse/Butter/Sahne/Joghurt/Quark/Schmand/Sahnesaucen/Bechamel. Laktose=Milch/Käse/Butter/Sahne/Joghurt. Nüsse=Mandeln/Walnüsse/Cashews/Erdnüsse. Wenn eine Zutat eine Unverträglichkeit verletzt, trag die Ersatz-Zutat NUR für die betroffene Person in allergie[GerichtName] ein als "Menge Produkt (für Person)", z.B. "1 Packung glutenfreier Pizzateig (für Heiko)". Die anderen Familienmitglieder essen das normale Gericht. Wenn keine Unverträglichkeit betroffen ist, setze allergie[GerichtName] auf [].'
  const prompt = `Du bist Rémy. Plane ${slotHinweis} für ${planTage.join(', ')} für Familie Flechner. Profil: ${familienProfil}.${wishHinweis}${historyHinweis}${behalteneHinweis}${gaesteHinweis} Gefriertruhe: ${freezerList}. Speisekammer: ${pantryList}. Nutze Gefriertruhe/Speisekammer wenn sinnvoll – Artikel mit [DRINGEND] müssen diese Woche eingeplant werden. Weise pro Tag+Slot Küchenchef zu (MA PA TI) nach Fairness. SCHRITT 1 – Gerichtsauswahl: Wähle immer normale, typische Familiengerichte für die ganze Familie – niemals vorsorglich glutenfreie, laktosefreie oder anderweitig angepasste Varianten, auch wenn Unverträglichkeiten im Profil stehen. Das normale Gericht wird für alle gekocht. Ändere Gerichtsnamen nie. ${allergenCheck} Antworte NUR als reines JSON ohne Markdown-Codeblock: {"woche":[${beispiele.join(',')}],"allergie":{"GerichtName":["Menge Ersatz (für Person)"],"GerichtName2":[]}} — allergie enthält für JEDES Gericht in woche einen Eintrag (leeres Array wenn keine Anpassung nötig).`

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    console.log('[week-plan] API status:', resp.status, '| stop_reason:', data?.stop_reason, '| error:', data?.error?.type)
    if (!data?.content?.[0]?.text) {
      console.error('[week-plan] Unexpected API response:', JSON.stringify(data).slice(0, 300))
      throw new Error('No content in response')
    }
    const raw = data.content[0].text as string
    console.log('[week-plan] raw response (first 600):', raw.slice(0, 600))
    const jsonStr = extractFirstJson(raw)
    if (!jsonStr) throw new Error('No JSON object found in response')
    const parsed = JSON.parse(jsonStr)

    const allergie = (parsed.allergie ?? {}) as Record<string, string[]>
    const result = [...(behaltene || []), ...parsed.woche]
    return NextResponse.json({ woche: result, allergie })
  } catch (e) {
    console.error('[week-plan] Caught error, returning fallback:', e instanceof Error ? e.message : String(e))
    const fallback: object[] = []
    planTage.forEach((t: string, i: number) => {
      if (hasMittag(t)) {
        const fm = FB_MITTAG[i % FB_MITTAG.length]
        fallback.push({ tag: t, slot: 'Mittag', emoji: fm.e, gericht: fm.g, minuten: fm.m, quelle: fm.q, chef: chefRota[i % 4] })
      }
      const fa = FB_ABEND[i % FB_ABEND.length]
      fallback.push({ tag: t, slot: 'Abend', emoji: fa.e, gericht: fa.g, minuten: fa.m, quelle: fa.q, chef: chefRota[(i + 1) % 4] })
    })
    return NextResponse.json({ woche: [...(behaltene || []), ...fallback], allergie: {} })
  }
}
