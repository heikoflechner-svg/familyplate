import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

type Zutat = { menge: string; name: string; typ: string }
type RezeptResult = {
  name: string; emoji: string; zutaten: Zutat[]; schritte: string[]
  minuten: number; schwierigkeit: string; personenAnzahl?: number
  arbeitszeitMinuten?: number; zeitGeschaetzt?: boolean
  quelle?: string; quelleUrl?: string
}

function parseIsoDuration(s: string): number {
  if (!s || typeof s !== 'string') return 0
  const h = parseInt(s.match(/(\d+)H/)?.[1] ?? '0')
  const m = parseInt(s.match(/(\d+)M/)?.[1] ?? '0')
  return h * 60 + m
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    try {
      const raw = JSON.parse(match[1])
      const candidates = Array.isArray(raw) ? raw : [raw, ...((raw?.['@graph'] as unknown[]) ?? [])]
      for (const entry of candidates) {
        if (!entry || typeof entry !== 'object') continue
        const t = (entry as Record<string, unknown>)['@type']
        if (t === 'Recipe' || (Array.isArray(t) && (t as string[]).includes('Recipe'))) {
          return entry as Record<string, unknown>
        }
      }
    } catch { /* ignore */ }
  }
  return null
}

function extractAuthorName(auth: unknown): string {
  if (!auth) return ''
  if (typeof auth === 'string') return auth
  if (Array.isArray(auth) && auth.length > 0) {
    const a = auth[0] as Record<string, unknown>
    return String(a?.name ?? '')
  }
  if (typeof auth === 'object') return String((auth as Record<string, unknown>).name ?? '')
  return ''
}

function flattenInstructions(items: Array<string | Record<string, unknown>>): string[] {
  const result: string[] = []
  for (const item of items) {
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim())
    } else if (item && typeof item === 'object') {
      const type = item['@type'] as string | undefined
      const isSectionType = type === 'HowToSection' || (Array.isArray(type) && (type as string[]).includes('HowToSection'))
      if (isSectionType) {
        const nested = item.itemListElement as Array<string | Record<string, unknown>> | undefined
        if (Array.isArray(nested)) result.push(...flattenInstructions(nested))
      } else {
        const text = String(item.text ?? item.name ?? '')
        if (text.trim()) result.push(text.trim())
      }
    }
  }
  return result
}

function jsonLdToRezept(data: Record<string, unknown>, sourceUrl?: string): RezeptResult {
  const name = String(data.name ?? 'Unbekanntes Rezept')

  const rawIngredients = (data.recipeIngredient as string[] | undefined) ?? []
  const zutaten: Zutat[] = rawIngredients.map(s => {
    const parts = s.trim().split(/\s+/)
    if (parts.length >= 2 && /\d/.test(parts[0])) {
      return { menge: parts[0], name: parts.slice(1).join(' '), typ: 'Sonstiges' }
    }
    return { menge: '', name: s.trim(), typ: 'Sonstiges' }
  })

  const rawInstructions = (data.recipeInstructions as Array<string | Record<string, unknown>> | undefined) ?? []
  const schritte: string[] = flattenInstructions(rawInstructions)

  const totalDur = parseIsoDuration(String(data.totalTime ?? ''))
  const cookDur = parseIsoDuration(String(data.cookTime ?? ''))
  const prepDur = parseIsoDuration(String(data.prepTime ?? ''))
  const minuten = totalDur || cookDur + prepDur || cookDur || prepDur || 30
  const arbeitszeitMinuten = prepDur && prepDur !== minuten ? prepDur : undefined

  const yld = data.recipeYield
  let personenAnzahl = 4
  if (typeof yld === 'number') personenAnzahl = yld
  else if (typeof yld === 'string') { const n = parseInt(yld); if (!isNaN(n)) personenAnzahl = n }
  else if (Array.isArray(yld) && yld.length > 0) { const n = parseInt(String(yld[0])); if (!isNaN(n)) personenAnzahl = n }

  const pubRaw = data.publisher as string | Record<string, unknown> | undefined
  const pubName = pubRaw ? (typeof pubRaw === 'string' ? pubRaw : String((pubRaw as Record<string, unknown>).name ?? '')) : ''
  const authName = extractAuthorName(data.author)
  let quelle = pubName && authName ? `${pubName} – ${authName}` : pubName || authName
  if (!quelle && sourceUrl) {
    try { quelle = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { /* */ }
  }

  return { name, emoji: '🍽️', zutaten, schritte, minuten, schwierigkeit: 'Mittel', personenAnzahl, arbeitszeitMinuten, zeitGeschaetzt: false, quelle: quelle || undefined, quelleUrl: sourceUrl || undefined }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PARSE_PROMPT = `Extrahiere aus dem folgenden Text/Bild ein Rezept auf Deutsch. Antworte NUR als reines JSON ohne Markdown-Codeblock:
{"name":"Rezeptname","emoji":"passendes Emoji","zutaten":[{"menge":"200g","name":"Mehl","typ":"Trocken"}],"schritte":["Schritt 1","Schritt 2"],"minuten":30,"arbeitszeitMinuten":15,"zeitGeschaetzt":false,"schwierigkeit":"Einfach","personenAnzahl":4,"quelle":"Quelle falls erkennbar"}
Regeln:
- Schwierigkeit: "Einfach", "Mittel" oder "Schwer". Typ: "Gemüse","Fleisch","Fisch","Trocken","Milch","Ei","Sonstiges".
- minuten = Gesamtzeit (Arbeitszeit + Ruhezeit/Wartezeit) für die Planung. Suche nach "Gesamtzeit", "Arbeitszeit", "Zubereitungszeit", "Koch-/Backzeit", "Ruhezeit" und rechne sie zusammen.
- arbeitszeitMinuten = nur die aktive Zubereitungszeit (ohne Ruhezeit, Kühlzeit, Backzeit). Weglassen wenn gleich wie minuten.
- zeitGeschaetzt: true wenn keine Zeit im Text steht und du schätzt, false wenn die Zeit explizit angegeben ist.
- quelle: Website-Name und/oder Autor falls erkennbar, sonst Feld weglassen.`

async function callClaude(apiKey: string, messages: object[]): Promise<RezeptResult | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages }),
  })
  const data = await resp.json() as { content?: Array<{ text?: string }> }
  const text = data?.content?.[0]?.text ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as RezeptResult
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const { type, content } = await req.json() as { type: string; content: string }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ fehler: 'API nicht verfügbar.' })

  try {
    if (type === 'url') {
      let html: string
      try {
        const resp = await fetch(content, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyPlate/1.0)' },
          signal: AbortSignal.timeout(10000),
        })
        if (resp.status === 401 || resp.status === 403) {
          return NextResponse.json({ fehler: 'Diese Seite ist gesperrt. Bitte Screenshot machen und 📷 Foto nutzen.' })
        }
        html = await resp.text()
      } catch {
        return NextResponse.json({ fehler: 'Seite konnte nicht geladen werden. Bitte Link prüfen.' })
      }
      const jsonLd = extractJsonLd(html)
      if (jsonLd) return NextResponse.json({ rezept: jsonLdToRezept(jsonLd, content) })
      const text = stripHtml(html).slice(0, 5000)
      let quelleFromUrl = ''
      try { quelleFromUrl = new URL(content).hostname.replace(/^www\./, '') } catch { /* */ }
      const rezept = await callClaude(apiKey, [{ role: 'user', content: `${PARSE_PROMPT}\n\n${text}` }])
      if (!rezept) return NextResponse.json({ fehler: 'Rezept konnte nicht ausgelesen werden.' })
      if (!rezept.quelle && quelleFromUrl) rezept.quelle = quelleFromUrl
      if (!rezept.quelleUrl) rezept.quelleUrl = content
      return NextResponse.json({ rezept })
    }

    if (type === 'text') {
      const rezept = await callClaude(apiKey, [{ role: 'user', content: `${PARSE_PROMPT}\n\n${content}` }])
      if (!rezept) return NextResponse.json({ fehler: 'Rezept konnte nicht ausgelesen werden.' })
      return NextResponse.json({ rezept })
    }

    if (type === 'image') {
      const match = content.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (!match) return NextResponse.json({ fehler: 'Ungültiges Bildformat.' })
      const [, mediaType, base64] = match
      const rezept = await callClaude(apiKey, [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `${PARSE_PROMPT}\n\nExtrahiere das Rezept aus diesem Bild.` },
        ],
      }])
      if (!rezept) return NextResponse.json({ fehler: 'Rezept konnte nicht aus dem Bild ausgelesen werden.' })
      return NextResponse.json({ rezept })
    }

    return NextResponse.json({ fehler: 'Unbekannter Typ.' })
  } catch (e) {
    console.error('[aus-quelle]', e)
    return NextResponse.json({ fehler: 'Fehler beim Auslesen des Rezepts.' })
  }
}
