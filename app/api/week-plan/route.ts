import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

type WishJSON = { person: string; tag: string; slot: string; type: string; text?: string; dishName?: string; emoji?: string }

// Findet das erste vollständige {…}-Objekt im Text (Klammer-Tiefenzähler).
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
  const { mittagsloseTage, planWE, freezerList, pantryList, behaltene, neuTage, wishes, familyPrompt, lastDishes, gaesteProTag, memberIds, mahlzeitenKonfig, vermeidenList, empfehlenList, ernährungsHinweis } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('[week-plan] apiKey present:', !!apiKey, '| length:', apiKey?.length ?? 0)

  if (!apiKey) {
    console.error('[week-plan] Kein API-Key konfiguriert')
    return NextResponse.json({ error: 'no_api_key', message: 'Kein API-Schlüssel konfiguriert.' }, { status: 500 })
  }

  const tage = planWE
    ? ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
    : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const planTage = neuTage?.length ? neuTage : tage
  const mittagslosSet = new Set<string>(mittagsloseTage ?? [])
  const hasMittag = (tag: string) => !mittagslosSet.has(tag)
  const mittagTage = planTage.filter((t: string) => hasMittag(t))

  const konfig = (mahlzeitenKonfig ?? {}) as Record<string, { mittag: string; abend: string }>
  const hasKonfig = Object.keys(konfig).length > 0

  const slotHinweis = hasKonfig
    ? planTage.map((t: string) => {
        const k = konfig[t]
        if (!k) return null
        const parts: string[] = []
        if (k.mittag === 'kein') {
          // no Mittag for this day
        } else if (k.mittag === 'leicht') {
          parts.push('Mittag: leichte Mahlzeit')
        } else {
          parts.push('Mittag: normale Hauptmahlzeit')
        }
        if (k.abend === 'leicht') {
          parts.push('Abend: leichte Mahlzeit')
        } else {
          parts.push('Abend: normale Hauptmahlzeit')
        }
        return parts.length > 0 ? `${t}: ${parts.join(', ')}` : null
      }).filter(Boolean).join(' | ')
    : (mittagTage.length === 0
        ? 'nur Abend'
        : mittagTage.length === planTage.length
          ? 'Mittag UND Abend'
          : `Mittag UND Abend (Mittag nur an: ${mittagTage.join(', ')})`)
  const chefRota: string[] = (Array.isArray(memberIds) && memberIds.length > 0)
    ? memberIds
    : ['A', 'B', 'C']

  const getTyp = (t: string, slot: 'Mittag' | 'Abend'): string => {
    const k = konfig[t]
    if (!k) return 'normal'
    return slot === 'Mittag' ? (k.mittag === 'kein' ? 'normal' : k.mittag) : k.abend
  }
  const beispiele: string[] = []
  planTage.forEach((t: string, i: number) => {
    if (hasMittag(t)) beispiele.push(`{"tag":"${t}","slot":"Mittag","emoji":"...","gericht":"...","minuten":20,"quelle":"frisch","chef":"${chefRota[i % chefRota.length]}","mahlzeitTyp":"${getTyp(t,'Mittag')}"}`)
    beispiele.push(`{"tag":"${t}","slot":"Abend","emoji":"...","gericht":"...","minuten":30,"quelle":"frisch","chef":"${chefRota[(i + 1) % chefRota.length]}","mahlzeitTyp":"${getTyp(t,'Abend')}"}`)
  })

  const wishList = (wishes ?? []) as WishJSON[]
  const wishHinweis = wishList.length
    ? ` Familienwünsche (bitte berücksichtigen): ${wishList.map(w => `${w.person} (${w.tag} ${w.slot === 'Mittag' ? '🌞' : '🌙'}): ${w.type === 'ergaenzung' ? `Notiz: ${w.text}` : `Alternative: ${w.emoji ?? ''} ${w.dishName ?? ''}`}`).join(', ')}.`
    : ''
  const lastDishesList = (lastDishes as string[] | undefined | null) ?? []
  const historyHinweis = lastDishesList.length > 0
    ? ` Bitte diese Gerichte diese Woche NICHT wiederholen (letzte Wochen): ${lastDishesList.join(', ')}.`
    : ''
  const vermeidenArr = (vermeidenList as string[] | undefined | null) ?? []
  const vermeidenHinweis = vermeidenArr.length > 0
    ? ` Diese Gerichte niemals einplanen (schlechte Familienbewertung): ${vermeidenArr.join(', ')}.`
    : ''
  const empfehlenArr = (empfehlenList as string[] | undefined | null) ?? []
  const empfehlenHinweis = empfehlenArr.length > 0
    ? ` Diese Gerichte darf Rémy gerne ab und zu vorschlagen (von Familie hoch bewertet): ${empfehlenArr.join(', ')}.`
    : ''
  const behalteneList = Array.isArray(behaltene) ? (behaltene as { gericht: string }[]) : []
  const behalteneHinweis = behalteneList.length > 0
    ? ` Bereits fest geplant (bitte nicht nochmals wählen): ${behalteneList.map(e => e.gericht).filter(Boolean).join(', ')}.`
    : ''
  const gaesteList = (gaesteProTag as Array<{ tag: string; gaeste: number }> | undefined | null) ?? []
  const gaesteHinweis = gaesteList.length > 0
    ? ` Gäste: ${gaesteList.map(g => `am ${g.tag} kommen ${g.gaeste} zusätzliche${g.gaeste === 1 ? 'r Gast' : ' Gäste'}`).join(', ')} – bitte an diesen Tagen gut skalierbare Gerichte einplanen, die sich einfach für mehr Personen zubereiten lassen.`
    : ''

  const ernährungsStr = (ernährungsHinweis as string | undefined | null) ?? ''
  const ernährungsHinweisStr = ernährungsStr.trim() ? ` Ernährungsrichtlinie: ${ernährungsStr.trim()}` : ''
  const familienProfil = familyPrompt || 'Familienmitglieder mit individuellen Vorlieben und Unverträglichkeiten'
  console.log('[week-plan] familyPrompt:', familienProfil)
  console.log('[week-plan] lastDishes:', lastDishesList.length, 'Einträge')
  console.log('[week-plan] gaesteProTag:', gaesteList.length, 'Tage mit Gästen')
  const allergenCheck = 'SCHRITT 2 – Allergen-Check (nach der Auswahl): Prüfe für jedes gewählte Gericht, ob Zutaten eine Unverträglichkeit aus dem Profil verletzen. Quellen: Gluten=Mehl/Pasta/Brot/Pizzateig/Paniermehl. Kasein=Milch/Käse/Butter/Sahne/Joghurt/Quark/Schmand/Sahnesaucen/Bechamel. Laktose=Milch/Käse/Butter/Sahne/Joghurt. Nüsse=Mandeln/Walnüsse/Cashews/Erdnüsse. Wenn eine Zutat eine Unverträglichkeit verletzt, trag die Ersatz-Zutat NUR für die betroffene Person in allergie[GerichtName] ein als "Menge Produkt (für Person)", z.B. "1 Packung glutenfreier Pizzateig (für Heiko)". Die anderen Familienmitglieder essen das normale Gericht. Sonderfall – Gericht besteht hauptsächlich aus der Allergen-Zutat (z.B. Rührei bei Ei-Unverträglichkeit): Keinen unsinnigen Ersatz einsetzen (nicht "Mais für Tim"). Stattdessen vollwertige Variante nennen (z.B. "Tofu-Rührei (für Tim)"), die selbst zu ALLEN Allergien und Abneigungen der betroffenen Person passt. Wenn keine Unverträglichkeit betroffen ist, setze allergie[GerichtName] auf [].'
  const leichtDef = hasKonfig ? ' Mahlzeit-Typen: leicht = einfaches Gericht, warm oder kalt (z.B. Suppe, Omelett, Ofengemüse, Bowl, Wrap, Brotzeit, Pfannkuchen, Quiche, Salat) – abwechslungsreich variieren, Salat höchstens 2× pro Woche als leichte Mahlzeit. normal = vollwertige, meist warme Hauptmahlzeit (z.B. Pasta, Fleisch, Eintopf, Auflauf, Curry, Pfannengericht) – KEIN Brot, Aufschnitt, Brotzeit oder Käsebrot als alleiniges Gericht an einem normal-Slot. Wähle Gerichte STRIKT nach dem mahlzeitTyp im JSON-Beispiel. Allergie-Anpassungen (fuer-Zutaten) vollständig beibehalten.' : ''
  const abneigungHinweis = ' Abneigungen (im Profil als "mag nicht" vermerkt): Plant ein Gericht, bei dem eine abgelehnte Zutat die Hauptzutat ist (z.B. Pilzrisotto wenn jemand keine Pilze mag), dieses Gericht NICHT ein – wähle stattdessen ein anderes. Ist die Zutat nur Beiwerk, ist das Gericht trotzdem erlaubt.'
  const prompt = `Du bist Rémy. Plane ${slotHinweis} für ${planTage.join(', ')} für die Familie. Profil: ${familienProfil}.${wishHinweis}${historyHinweis}${vermeidenHinweis}${empfehlenHinweis}${behalteneHinweis}${gaesteHinweis}${ernährungsHinweisStr} Gefriertruhe: ${freezerList}. Speisekammer: ${pantryList}. Nutze Gefriertruhe/Speisekammer wenn sinnvoll – Artikel mit [DRINGEND] müssen diese Woche eingeplant werden, Artikel mit [BALD VERBRAUCHEN] möglichst diese Woche verwenden. Weise pro Tag+Slot Küchenchef zu (${chefRota.join(' ')}) nach Fairness.${leichtDef}${abneigungHinweis} SCHRITT 1 – Gerichtsauswahl: Wähle immer normale, typische Familiengerichte für die ganze Familie – niemals vorsorglich glutenfreie, laktosefreie oder anderweitig angepasste Varianten, auch wenn Unverträglichkeiten im Profil stehen. Das normale Gericht wird für alle gekocht. Nenne im Gerichtsnamen immer die wichtigste Zutat (v.a. Fleisch/Fisch/Hülsenfrüchte): "Salat mit Hähnchenbrust" statt "Bunter Salat", "Pasta mit Lachs" statt "Nudelgericht" – generische Namen wie "Bunter Salat" oder "Gemüsegericht" sind nicht erlaubt. Ändere Gerichtsnamen nie. ${allergenCheck} Setze mahlzeitTyp exakt so wie im JSON-Beispiel vorgegeben. Antworte NUR als reines JSON ohne Markdown-Codeblock: {"woche":[${beispiele.join(',')}],"allergie":{"GerichtName":["Menge Ersatz (für Person)"],"GerichtName2":[]}} — allergie enthält für JEDES Gericht in woche einen Eintrag (leeres Array wenn keine Anpassung nötig).`

  async function attemptGeneration(): Promise<{ woche: object[]; allergie: Record<string, string[]> }> {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    let data: Record<string, unknown>
    try {
      data = await resp.json()
    } catch {
      throw new Error(`HTTP_${resp.status}: Antwort kein JSON`)
    }

    console.log('[week-plan] API status:', resp.status, '| stop_reason:', (data as Record<string, unknown>)?.stop_reason, '| error:', (data as Record<string, Record<string, unknown>>)?.error?.type)

    if (!resp.ok) {
      const errMsg = ((data as Record<string, Record<string, unknown>>)?.error?.message as string) ?? `HTTP ${resp.status}`
      throw new Error(`API_${resp.status}: ${errMsg}`)
    }

    if ((data as Record<string, unknown>)?.stop_reason === 'max_tokens') {
      throw new Error('max_tokens: Antwort wurde abgeschnitten – zu viele Tage/Slots')
    }

    const rawText = ((data as Record<string, Array<Record<string, unknown>>>)?.content?.[0]?.text) as string | undefined
    if (!rawText) {
      console.error('[week-plan] Unerwartete API-Antwort:', JSON.stringify(data).slice(0, 300))
      throw new Error('Leere Antwort von der KI')
    }

    console.log('[week-plan] raw response (first 600):', rawText.slice(0, 600))
    const jsonStr = extractFirstJson(rawText)
    if (!jsonStr) throw new Error('Kein JSON-Objekt in der Antwort gefunden')

    const parsed = JSON.parse(jsonStr) as { woche: Array<Record<string, unknown>>; allergie?: Record<string, string[]> }

    const woche = parsed.woche.map(entry => ({
      ...entry,
      mahlzeitTyp: getTyp(entry.tag as string, entry.slot as 'Mittag' | 'Abend'),
    }))
    const allergie = (parsed.allergie ?? {}) as Record<string, string[]>
    return { woche: [...(behaltene || []), ...woche], allergie }
  }

  for (let n = 1; n <= 2; n++) {
    try {
      const result = await attemptGeneration()
      if (n > 1) console.log('[week-plan] Versuch', n, 'erfolgreich')
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[week-plan] Versuch ${n} fehlgeschlagen:`, msg)
      if (n === 2) {
        return NextResponse.json({ error: 'generation_failed', message: msg }, { status: 500 })
      }
      console.log('[week-plan] Wiederhole Versuch ...')
    }
  }

  // Dieser Pfad wird nie erreicht (Loop endet mit return), aber TypeScript braucht es
  return NextResponse.json({ error: 'generation_failed', message: 'Unbekannter Fehler' }, { status: 500 })
}
