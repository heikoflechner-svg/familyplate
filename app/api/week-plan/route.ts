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

type Zutat = { menge: string; name: string; typ: string }
type RezeptData = { name: string; emoji: string; zutaten: Zutat[]; schritte: string[]; minuten: number; schwierigkeit: string }

const FB_REZEPTE: Record<string, RezeptData> = {
  'Reste vom Vortag':   { name: 'Reste vom Vortag',  emoji: '🥗', zutaten: [], schritte: ['Reste aus dem Kühlschrank aufwärmen.'], minuten: 10, schwierigkeit: 'Einfach' },
  'Eintopf aufgewärmt': { name: 'Eintopf aufgewärmt', emoji: '🥣', zutaten: [], schritte: ['Eintopf erhitzen.'], minuten: 10, schwierigkeit: 'Einfach' },
  'Belegte Brote': { name: 'Belegte Brote', emoji: '🥪', zutaten: [
    { menge: '1 Packung', name: 'Toast oder Brot', typ: 'frisch' },
    { menge: 'nach Bedarf', name: 'Aufschnitt', typ: 'frisch' },
    { menge: 'nach Bedarf', name: 'Käse', typ: 'frisch' },
  ], schritte: ['Brot belegen und servieren.'], minuten: 10, schwierigkeit: 'Einfach' },
  'Nudelsuppe': { name: 'Nudelsuppe', emoji: '🍜', zutaten: [
    { menge: '1 Liter', name: 'Gemüsebrühe', typ: 'speisekammer' },
    { menge: '100g', name: 'Suppennudeln', typ: 'speisekammer' },
    { menge: '2', name: 'Möhren', typ: 'frisch' },
  ], schritte: ['Brühe aufkochen, Nudeln und Möhren ca. 10 Min. kochen.'], minuten: 15, schwierigkeit: 'Einfach' },
  'Wraps': { name: 'Wraps', emoji: '🥙', zutaten: [
    { menge: '4', name: 'Wraps', typ: 'frisch' },
    { menge: '200g', name: 'Hähnchenbrust', typ: 'frisch' },
    { menge: '1', name: 'Paprika', typ: 'frisch' },
    { menge: '100g', name: 'Salatblätter', typ: 'frisch' },
  ], schritte: ['Hähnchen würzen und braten, mit Gemüse in Wraps rollen.'], minuten: 15, schwierigkeit: 'Einfach' },
  'Salat': { name: 'Salat', emoji: '🥗', zutaten: [
    { menge: '1 Kopf', name: 'Kopfsalat', typ: 'frisch' },
    { menge: '2', name: 'Tomaten', typ: 'frisch' },
    { menge: '1/2', name: 'Gurke', typ: 'frisch' },
    { menge: '3 EL', name: 'Olivenöl', typ: 'frisch' },
  ], schritte: ['Gemüse waschen, schneiden und mit Öl und Essig dressieren.'], minuten: 10, schwierigkeit: 'Einfach' },
  'Eierspeise': { name: 'Eierspeise', emoji: '🍳', zutaten: [
    { menge: '4', name: 'Eier', typ: 'frisch' },
    { menge: '50ml', name: 'Milch', typ: 'frisch' },
    { menge: '1 EL', name: 'Butter', typ: 'frisch' },
  ], schritte: ['Eier mit Milch verquirlen, in Butter stocken lassen.'], minuten: 10, schwierigkeit: 'Einfach' },
  'Lasagne': { name: 'Lasagne', emoji: '🥗', zutaten: [
    { menge: '500g', name: 'Hackfleisch', typ: 'frisch' },
    { menge: '1 Packung', name: 'Lasagneblätter', typ: 'speisekammer' },
    { menge: '500ml', name: 'Tomatensauce (Glas)', typ: 'speisekammer' },
    { menge: '250ml', name: 'Bechamelsauce', typ: 'frisch' },
    { menge: '100g', name: 'Parmesan', typ: 'frisch' },
  ], schritte: ['Hack anbraten, mit Tomatensauce schichten, Bechamel drauf, backen.'], minuten: 45, schwierigkeit: 'Mittel' },
  'Hähnchen-Pasta': { name: 'Hähnchen-Pasta', emoji: '🍗', zutaten: [
    { menge: '400g', name: 'Hähnchenfilets', typ: 'tiefkühl' },
    { menge: '250g', name: 'Spaghetti', typ: 'speisekammer' },
    { menge: '1 Dose', name: 'Tomaten (stückig)', typ: 'speisekammer' },
    { menge: '2 Zehen', name: 'Knoblauch', typ: 'frisch' },
  ], schritte: ['Hähnchen anbraten, Sauce kochen, mit Pasta servieren.'], minuten: 30, schwierigkeit: 'Einfach' },
  'Gemüsecurry': { name: 'Gemüsecurry', emoji: '🍲', zutaten: [
    { menge: '1 Dose', name: 'Kokosmilch', typ: 'speisekammer' },
    { menge: '2 EL', name: 'Currypaste', typ: 'speisekammer' },
    { menge: '300g', name: 'Gemüsemix (TK)', typ: 'tiefkühl' },
    { menge: '200g', name: 'Basmatireis', typ: 'speisekammer' },
  ], schritte: ['Currypaste kurz anrösten, Kokosmilch und Gemüse dazugeben, mit Reis servieren.'], minuten: 20, schwierigkeit: 'Einfach' },
  'Selbstgemachte Pizza': { name: 'Selbstgemachte Pizza', emoji: '🍕', zutaten: [
    { menge: '1 Packung', name: 'Pizzateig (fertig)', typ: 'frisch' },
    { menge: '200ml', name: 'Tomatensauce', typ: 'speisekammer' },
    { menge: '200g', name: 'Mozzarella', typ: 'frisch' },
    { menge: 'nach Wunsch', name: 'Pizzabelag', typ: 'frisch' },
  ], schritte: ['Teig ausrollen, belegen, bei 220°C ca. 15 Min. backen.'], minuten: 40, schwierigkeit: 'Einfach' },
  'Lachs mit Reis': { name: 'Lachs mit Reis', emoji: '🐟', zutaten: [
    { menge: '2 Stück', name: 'Lachsfilet', typ: 'tiefkühl' },
    { menge: '200g', name: 'Basmatireis', typ: 'speisekammer' },
    { menge: '1', name: 'Zitrone', typ: 'frisch' },
  ], schritte: ['Lachs in der Pfanne braten, Reis kochen, mit Zitronensaft servieren.'], minuten: 25, schwierigkeit: 'Einfach' },
  'Tacos': { name: 'Tacos', emoji: '🌮', zutaten: [
    { menge: '8', name: 'Taco-Shells', typ: 'speisekammer' },
    { menge: '300g', name: 'Hackfleisch', typ: 'frisch' },
    { menge: '1', name: 'Zwiebel', typ: 'frisch' },
    { menge: '1 Dose', name: 'Kidneybohnen', typ: 'speisekammer' },
    { menge: '100g', name: 'Salatblätter', typ: 'frisch' },
  ], schritte: ['Hack mit Gewürzen und Bohnen braten, Tacos befüllen.'], minuten: 25, schwierigkeit: 'Einfach' },
  'Spaghetti Bolognese': { name: 'Spaghetti Bolognese', emoji: '🍝', zutaten: [
    { menge: '500g', name: 'Hackfleisch', typ: 'frisch' },
    { menge: '250g', name: 'Spaghetti', typ: 'speisekammer' },
    { menge: '1 Dose', name: 'Tomaten (stückig)', typ: 'speisekammer' },
    { menge: '1', name: 'Zwiebel', typ: 'frisch' },
    { menge: '2 Zehen', name: 'Knoblauch', typ: 'frisch' },
  ], schritte: ['Hack mit Zwiebel und Knoblauch anbraten, Sauce kochen, mit Spaghetti servieren.'], minuten: 35, schwierigkeit: 'Einfach' },
}

function buildFallbackRezepte(entries: { gericht: string; emoji: string }[]): Record<string, RezeptData> {
  const rezepte: Record<string, RezeptData> = {}
  for (const e of entries) {
    if (FB_REZEPTE[e.gericht]) {
      rezepte[e.gericht] = FB_REZEPTE[e.gericht]
    }
  }
  return rezepte
}

type WishJSON = { person: string; tag: string; slot: string; type: string; text?: string; dishName?: string; emoji?: string }

export async function POST(req: NextRequest) {
  const { planMittag, planWE, freezerList, pantryList, behaltene, neuTage, wishes, familyPrompt } = await req.json()

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
    return NextResponse.json({ woche: result, rezepte: buildFallbackRezepte(fallback as { gericht: string; emoji: string }[]) })
  }

  const beispiele: string[] = []
  planTage.forEach((t: string, i: number) => {
    if (planMittag) beispiele.push(`{"tag":"${t}","slot":"Mittag","emoji":"...","gericht":"...","minuten":20,"quelle":"frisch","chef":"${chefRota[i % 4]}"}`)
    beispiele.push(`{"tag":"${t}","slot":"Abend","emoji":"...","gericht":"...","minuten":30,"quelle":"frisch","chef":"${chefRota[(i + 1) % 4]}"}`)
  })

  const wishList = (wishes ?? []) as WishJSON[]
  const wishHinweis = wishList.length
    ? ` Familienwünsche (bitte berücksichtigen): ${wishList.map(w => `${w.person} (${w.tag} ${w.slot === 'Mittag' ? '🌞' : '🌙'}): ${w.type === 'ergaenzung' ? `Notiz: ${w.text}` : `Alternative: ${w.emoji ?? ''} ${w.dishName ?? ''}`}`).join(', ')}.`
    : ''

  const familienProfil = familyPrompt || 'Sabine (MA) keine Nüsse mag Fisch, Heiko (PA) laktosefrei mag Pasta, Tim (TI) kein Fisch mag Nudeln'
  const rezeptBeispiel = `{"zutaten":[{"menge":"200g","name":"Zutat","typ":"frisch"}],"schritte":["Kurze Zubereitung"],"minuten":30,"schwierigkeit":"Einfach","ersetzteZutaten":["Weizenmehl → glutenfreies Mehl (für Heiko)"]}`
  const prompt = `Du bist Rémy. Plane ${slotHinweis} für ${planTage.join(', ')} für Familie Flechner. Profil: ${familienProfil}.${wishHinweis} Gefriertruhe: ${freezerList}. Speisekammer: ${pantryList}. Nutze Gefriertruhe/Speisekammer wenn sinnvoll. Weise pro Tag+Slot Küchenchef zu (MA PA TI) nach Fairness. WICHTIG: Ersetze bei den Rezept-Zutaten alle Zutaten, die gegen eine genannte Unverträglichkeit verstoßen, durch passende Alternativen (z.B. Weizenmehl → glutenfreies Mehl, Kuhmilch → Laktosefreie Milch, normale Pasta → glutenfreie Pasta). Wähle das Gericht trotzdem – passe nur die Zutat an. Wenn Zutaten ersetzt wurden, liste sie in ersetzteZutaten als ["Original → Ersatz (für Person)"]. Wenn keine Ersetzung nötig war, setze ersetzteZutaten auf []. Antworte NUR als JSON: {"woche":[${beispiele.join(',')}],"rezepte":{"GerichtName":${rezeptBeispiel}}} — Für jedes Gericht in woche muss ein Eintrag in rezepte stehen. typ ist eines von: frisch, tiefkühl, speisekammer, gefriertruhe. Nur Zutaten die man einkaufen muss.`

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    const parsed = JSON.parse(data.content[0].text)

    // Build complete rezepte: add name+emoji from woche, fall back to FB_REZEPTE for missing entries
    const rezepte: Record<string, RezeptData> = {}
    for (const [gericht, recipe] of Object.entries(parsed.rezepte ?? {})) {
      const entry = (parsed.woche as { gericht: string; emoji: string }[]).find(e => e.gericht === gericht)
      rezepte[gericht] = { name: gericht, emoji: entry?.emoji ?? '🍽', ...(recipe as object) } as RezeptData
    }
    for (const entry of (parsed.woche as { gericht: string; emoji: string }[])) {
      if (!rezepte[entry.gericht] && FB_REZEPTE[entry.gericht]) {
        rezepte[entry.gericht] = FB_REZEPTE[entry.gericht]
      }
    }

    const result = [...(behaltene || []), ...parsed.woche]
    return NextResponse.json({ woche: result, rezepte })
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
    return NextResponse.json({ woche: [...(behaltene || []), ...fallback], rezepte: buildFallbackRezepte(fallback as { gericht: string; emoji: string }[]) })
  }
}
