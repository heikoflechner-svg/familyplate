'use client'
import { useState, useEffect, useRef } from 'react'
import type { Rezept, Rezeptzutat, WeekPlanEntry, DayAttendance, FamilyMember, Chef } from '../lib/state'
import type { RezeptbuchEntry } from '../lib/state'
import { loadWeekHistory, isFullRecipe } from '../lib/mealLogic'
import { checkAllergens, formatAllergenWarningsCard } from '../lib/allergenCheck'
import { computeRatingAvg, fmtAvg, type DishRating } from '../lib/dishRatingsLogic'
import RecipeModal from './RecipeModal'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export type RezeptSelection = {
  gericht: string
  emoji: string
  minuten: number
  rezept: Rezept
  bookEntryId?: string
}

type HistoryEntry = {
  weekStart: string
  wochenchef: string
  plan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
}

type PastDish = {
  gericht: string
  emoji: string
  date: string
  rezept: Rezept | null
}

interface Props {
  entries: RezeptbuchEntry[]
  currentUser: Chef
  canEditSettings: boolean
  members: FamilyMember[]
  mealsData: Record<string, Rezept>
  weekPlan: WeekPlanEntry[]
  weekStart: string | null
  attendance: DayAttendance[]
  onBack: () => void
  onSaveToBook?: (rezept: Rezept) => Promise<void>
  onUpdateRezept?: (id: string, rezept: Rezept) => Promise<void>
  onToggleFavorit?: (id: string, isFavorit: boolean) => Promise<void>
  onDeleteRezept?: (id: string) => Promise<void>
  onMarkGekocht: (id: string) => void
  selectionSlot?: { tag: string; slot: 'Mittag' | 'Abend' }
  onSelect?: (sel: RezeptSelection) => void
  dishRatings?: DishRating[]
  onRateGericht?: (gerName: string, sterne: number, member?: Chef, rezept?: Rezept) => void
}

type TabMode = 'book' | 'history'

type BookModal =
  | { kind: 'bookEntry'; entry: RezeptbuchEntry }
  | { kind: 'history'; dish: PastDish }
  | null

type SortMode = 'name' | 'gekocht' | 'recent' | 'rating' | 'longAgo'
type AddScreen = null | 'options' | 'input-text' | 'input-url' | 'preview' | 'edit'

export default function RezeptbuchScreen({
  entries, currentUser, canEditSettings, members, mealsData, weekPlan, weekStart,
  attendance, onBack, onSaveToBook, onUpdateRezept, onToggleFavorit, onDeleteRezept, onMarkGekocht,
  selectionSlot, onSelect, dishRatings = [], onRateGericht,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabMode>('book')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [modal, setModal] = useState<BookModal>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [saveToBookLoading, setSaveToBookLoading] = useState(false)
  const [savedToBookName, setSavedToBookName] = useState<string | null>(null)
  const [savedInlineNames, setSavedInlineNames] = useState<Set<string>>(new Set())

  // R3 – Rezept hinzufügen / bearbeiten
  const [addScreen, setAddScreen] = useState<AddScreen>(null)
  const [addTextVal, setAddTextVal] = useState('')
  const [addUrlVal, setAddUrlVal] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [previewRezept, setPreviewRezept] = useState<Rezept | null>(null)
  const [editEntry, setEditEntry] = useState<RezeptbuchEntry | null>(null)
  // shared editor state (preview + edit)
  const [prevName, setPrevName] = useState('')
  const [prevEmoji, setPrevEmoji] = useState('')
  const [prevMins, setPrevMins] = useState(30)
  const [prevArbeitszeit, setPrevArbeitszeit] = useState('')
  const [prevZeitGeschaetzt, setPrevZeitGeschaetzt] = useState(false)
  const [prevSchw, setPrevSchw] = useState('Einfach')
  const [prevZutaten, setPrevZutaten] = useState<Rezeptzutat[]>([])
  const [prevSchritte, setPrevSchritte] = useState<string[]>([])
  const [prevQuelle, setPrevQuelle] = useState('')
  const [prevQuelleUrl, setPrevQuelleUrl] = useState('')
  const [prevNotizen, setPrevNotizen] = useState('')
  const [prevSaving, setPrevSaving] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const isSelectionMode = !!selectionSlot
  // In selection mode the add/edit screens must never appear (they require props not passed in this mode)
  const effectiveAddScreen = isSelectionMode ? null : addScreen

  useEffect(() => {
    if (historyLoaded) return
    setHistoryLoading(true)
    loadWeekHistory(12).then(data => {
      setHistory((data ?? []) as HistoryEntry[])
      setHistoryLoading(false)
      setHistoryLoaded(true)
    })
  }, [historyLoaded])

  // ── Editor helpers ───────────────────────────────────────────────────────────
  function updateZutat(i: number, field: 'menge' | 'name', value: string) {
    setPrevZutaten(z => z.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeZutat(i: number) { setPrevZutaten(z => z.filter((_, idx) => idx !== i)) }
  function addZutat() { setPrevZutaten(z => [...z, { menge: '', name: '', typ: 'Sonstiges' }]) }
  function updateSchritt(i: number, value: string) {
    setPrevSchritte(s => s.map((item, idx) => idx === i ? value : item))
  }
  function removeSchritt(i: number) { setPrevSchritte(s => s.filter((_, idx) => idx !== i)) }
  function addSchritt() { setPrevSchritte(s => [...s, '']) }

  function loadEditorState(r: Rezept) {
    setPrevName(r.name)
    setPrevEmoji(r.emoji)
    setPrevMins(r.minuten)
    setPrevArbeitszeit(r.arbeitszeitMinuten ? String(r.arbeitszeitMinuten) : '')
    setPrevZeitGeschaetzt(r.zeitGeschaetzt ?? false)
    setPrevSchw(r.schwierigkeit)
    setPrevZutaten([...r.zutaten])
    setPrevSchritte([...r.schritte])
    setPrevQuelle(r.quelle ?? '')
    setPrevQuelleUrl(r.quelleUrl ?? '')
    setPrevNotizen(r.notizen ?? '')
  }

  function buildRezept(base: Rezept): Rezept {
    const arb = prevArbeitszeit.trim() ? parseInt(prevArbeitszeit) || undefined : undefined
    return {
      ...base,
      name: prevName.trim() || base.name,
      emoji: prevEmoji || base.emoji,
      minuten: prevMins,
      arbeitszeitMinuten: arb,
      zeitGeschaetzt: prevZeitGeschaetzt,
      schwierigkeit: prevSchw,
      zutaten: prevZutaten,
      schritte: prevSchritte,
      quelle: prevQuelle.trim() || undefined,
      quelleUrl: prevQuelleUrl.trim() || undefined,
      notizen: prevNotizen.trim() || undefined,
    }
  }

  // ── R3 API call ──────────────────────────────────────────────────────────────
  function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 800
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function callAusQuelle(type: string, content: string): Promise<void> {
    setAddLoading(true)
    setAddError(null)
    try {
      const resp = await fetch('/api/rezeptbuch/aus-quelle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content }),
      })
      const data = await resp.json() as { rezept?: Rezept; fehler?: string }
      if (data.fehler) { setAddError(data.fehler); return }
      if (!data.rezept) { setAddError('Kein Rezept gefunden.'); return }
      const r = data.rezept
      setPreviewRezept(r)
      loadEditorState(r)
      setAddScreen('preview')
    } catch {
      setAddError('Netzwerkfehler. Bitte erneut versuchen.')
    } finally {
      setAddLoading(false)
    }
  }

  async function handlePreviewSave(): Promise<void> {
    if (!previewRezept || !onSaveToBook) return
    setPrevSaving(true)
    try {
      await onSaveToBook(buildRezept(previewRezept))
      setAddScreen(null); setPreviewRezept(null); setAddTextVal(''); setAddUrlVal(''); setAddError(null)
    } finally { setPrevSaving(false) }
  }

  async function handleEditSave(): Promise<void> {
    if (!editEntry || !onUpdateRezept) return
    setPrevSaving(true)
    try {
      await onUpdateRezept(editEntry.id, buildRezept(editEntry.rezept))
      setAddScreen(null); setEditEntry(null)
    } finally { setPrevSaving(false) }
  }

  function handleOpenEdit(entry: RezeptbuchEntry) {
    setEditEntry(entry)
    loadEditorState(entry.rezept)
    setModal(null)
    setAddScreen('edit')
  }

  // ── Book helpers ─────────────────────────────────────────────────────────────
  function canEdit(entry: RezeptbuchEntry): boolean {
    return !isSelectionMode && (entry.erstelltVon === currentUser || canEditSettings)
  }

  function getSlotAllergenWarnings(rezept: Rezept): string[] {
    if (!selectionSlot || !isFullRecipe(rezept)) return []
    const dayAtt = attendance.find(a => a.tag === selectionSlot.tag)
    if (!dayAtt) return []
    const presentChefs = (selectionSlot.slot === 'Mittag' ? dayAtt.mittagAnwesend : dayAtt.abendAnwesend) ?? []
    const slotMembers = members
      .filter(m => presentChefs.includes(m.id as Chef))
      .filter(m => m.allergien.length > 0)
      .map(m => ({ name: m.name, allergien: m.allergien }))
    if (!slotMembers.length) return []
    return formatAllergenWarningsCard(checkAllergens(rezept, slotMembers))
  }

  function collectPastDishes(): PastDish[] {
    const seen = new Set<string>()
    const result: PastDish[] = []
    if (weekStart) {
      const mon = new Date(weekStart + 'T00:00:00')
      const today = new Date(); today.setHours(0, 0, 0, 0)
      for (const entry of weekPlan) {
        const dayIdx = WOCHENTAGE.indexOf(entry.tag)
        if (dayIdx < 0) continue
        const dayDate = new Date(mon); dayDate.setDate(mon.getDate() + dayIdx)
        if (dayDate >= today) continue
        const key = entry.gericht.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push({ gericht: entry.gericht, emoji: entry.emoji, date: dayDate.toISOString().slice(0, 10), rezept: mealsData[entry.gericht] ?? null })
      }
    }
    for (const week of history) {
      const mon = new Date(week.weekStart + 'T00:00:00')
      for (const entry of (week.plan ?? [])) {
        const key = entry.gericht.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const dayIdx = WOCHENTAGE.indexOf(entry.tag)
        const dayDate = new Date(mon)
        if (dayIdx >= 0) dayDate.setDate(mon.getDate() + dayIdx)
        result.push({ gericht: entry.gericht, emoji: entry.emoji, date: dayDate.toISOString().slice(0, 10), rezept: week.mealsData?.[entry.gericht] ?? null })
      }
    }
    return result.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
  }

  async function handleHistorySaveToBook(rezept: Rezept) {
    if (!onSaveToBook) return
    setSaveToBookLoading(true)
    try {
      await onSaveToBook(rezept)
      setSavedToBookName(rezept.name)
      setTimeout(() => setSavedToBookName(null), 3000)
    } finally { setSaveToBookLoading(false) }
  }

  const pastDishes = collectPastDishes()
  const favEntries = entries.filter(e => e.isFavorit)

  function sortEntries(list: RezeptbuchEntry[]): RezeptbuchEntry[] {
    if (sortMode === 'gekocht') return [...list].sort((a, b) => b.malGekocht - a.malGekocht)
    if (sortMode === 'recent') return [...list].sort((a, b) => (b.zuletztGekocht ?? '').localeCompare(a.zuletztGekocht ?? ''))
    if (sortMode === 'rating') return [...list].sort((a, b) => {
      const aAvg = computeRatingAvg(dishRatings, a.rezept.name)?.avg ?? 0
      const bAvg = computeRatingAvg(dishRatings, b.rezept.name)?.avg ?? 0
      return bAvg - aAvg
    })
    if (sortMode === 'longAgo') return [...list].sort((a, b) => (a.zuletztGekocht ?? '').localeCompare(b.zuletztGekocht ?? ''))
    return [...list].sort((a, b) => a.rezept.name.localeCompare(b.rezept.name, 'de'))
  }

  const filteredEntries = sortEntries(
    search.trim() ? entries.filter(e => e.rezept.name.toLowerCase().includes(search.toLowerCase())) : entries
  )

  const M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}. ${M[d.getMonth()]} ${d.getFullYear()}`
  }

  function fmtZeit(minuten: number, arbeitszeit?: number, geschaetzt?: boolean) {
    const pre = geschaetzt ? 'ca. ' : ''
    return `${pre}${minuten} min${arbeitszeit && arbeitszeit !== minuten ? ` (davon ${arbeitszeit} min Arbeit)` : ''}`
  }

  // ── Shared editor sub-renders ────────────────────────────────────────────────
  function renderBasicFields() {
    const inputStyle = { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', background: 'white', boxSizing: 'border-box' as const }
    return (
      <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: '0 0 60px' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Emoji</div>
            <input value={prevEmoji} onChange={e => setPrevEmoji(e.target.value)} style={{ ...inputStyle, fontSize: 22, textAlign: 'center', padding: '6px' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Name</div>
            <input value={prevName} onChange={e => setPrevName(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Gesamtzeit (Min.)</div>
            <input type="number" value={prevMins} onChange={e => setPrevMins(Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Arbeitszeit (Min.)</div>
            <input type="number" value={prevArbeitszeit} onChange={e => setPrevArbeitszeit(e.target.value)} placeholder="–" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Schwierigkeit</div>
            <select value={prevSchw} onChange={e => setPrevSchw(e.target.value)} style={{ ...inputStyle }}>
              <option>Einfach</option><option>Mittel</option><option>Schwer</option>
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={prevZeitGeschaetzt} onChange={e => setPrevZeitGeschaetzt(e.target.checked)} />
          <span style={{ fontSize: 12, color: '#888' }}>Zeit ist eine Schätzung (wird als „ca." angezeigt)</span>
        </label>
      </div>
    )
  }

  function renderZutatenEditor() {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>Zutaten</div>
        {prevZutaten.map((z, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
            <input value={z.menge} onChange={e => updateZutat(i, 'menge', e.target.value)} placeholder="Menge"
              style={{ width: 72, fontSize: 12, padding: '5px 7px', border: '1px solid #E5E7EB', borderRadius: 7, outline: 'none', boxSizing: 'border-box' as const }} />
            <input value={z.name} onChange={e => updateZutat(i, 'name', e.target.value)} placeholder="Zutat"
              style={{ flex: 1, fontSize: 12, padding: '5px 7px', border: '1px solid #E5E7EB', borderRadius: 7, outline: 'none', boxSizing: 'border-box' as const }} />
            <button onClick={() => removeZutat(i)} style={{ fontSize: 16, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button onClick={addZutat} style={{ fontSize: 12, color: '#1D9E75', background: 'none', border: '1px solid #B2DFCC', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginTop: 2 }}>
          + Zutat
        </button>
      </div>
    )
  }

  function renderSchritteEditor() {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>Zubereitung</div>
        {prevSchritte.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 6, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#1D9E75', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>{i + 1}</div>
            <textarea value={s} onChange={e => updateSchritt(i, e.target.value)} rows={2}
              style={{ flex: 1, fontSize: 12, padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: 7, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
            <button onClick={() => removeSchritt(i)} style={{ fontSize: 16, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', marginTop: 5, flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button onClick={addSchritt} style={{ fontSize: 12, color: '#1D9E75', background: 'none', border: '1px solid #B2DFCC', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginTop: 2 }}>
          + Schritt
        </button>
      </div>
    )
  }

  function renderQuelleFields() {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>Quelle (optional)</div>
        <input value={prevQuelle} onChange={e => setPrevQuelle(e.target.value)}
          placeholder='z.B. "Chefkoch – Max Mustermann" oder "Omas Rezept"'
          style={{ width: '100%', fontSize: 12, padding: '7px 10px', border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', marginBottom: 6, boxSizing: 'border-box' as const }} />
        <input value={prevQuelleUrl} onChange={e => setPrevQuelleUrl(e.target.value)}
          placeholder="Link zur Quelle (optional)"
          style={{ width: '100%', fontSize: 12, padding: '7px 10px', border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }} />
      </div>
    )
  }

  function renderAllergenWarnings() {
    const warns = formatAllergenWarningsCard(
      checkAllergens({ zutaten: prevZutaten }, members.filter(m => m.allergien.length > 0).map(m => ({ name: m.name, allergien: m.allergien })))
    )
    if (!warns.length) return null
    return (
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px' }}>
        {warns.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#DC2626' }}>{w}</div>)}
      </div>
    )
  }

  function renderSaveBtn(onSave: () => void, disabled: boolean) {
    return (
      <button onClick={onSave} disabled={prevSaving || disabled}
        style={{ padding: '14px', fontSize: 15, fontWeight: 700, background: prevSaving || disabled ? '#E5E7EB' : '#1D9E75', color: prevSaving || disabled ? '#aaa' : 'white', border: 'none', borderRadius: 12, cursor: prevSaving || disabled ? 'default' : 'pointer', marginBottom: 8 }}>
        {prevSaving ? '⏳ Wird gespeichert…' : '✓ Im Rezeptbuch speichern'}
      </button>
    )
  }

  // ── R3: Add screens ──────────────────────────────────────────────────────────
  if (effectiveAddScreen === 'options') {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back" onClick={() => { setAddScreen(null); setAddError(null) }}>‹</button>
          <h1 style={{ fontSize: 16 }}>+ Rezept hinzufügen</h1>
        </div>
        <div className="content" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              e.target.value = ''
              setAddError(null)
              try { await callAusQuelle('image', await compressImage(file)) }
              catch { setAddError('Bild konnte nicht verarbeitet werden.') }
            }} />
          {[
            { icon: '📷', label: 'Foto', sub: 'Kamera oder Galerie', action: () => imageInputRef.current?.click() },
            { icon: '📝', label: 'Text einfügen', sub: 'Rezepttext einfügen', action: () => { setAddError(null); setAddScreen('input-text') } },
            { icon: '🔗', label: 'Link einfügen', sub: 'Rezept-URL eingeben', action: () => { setAddError(null); setAddScreen('input-url') } },
          ].map(({ icon, label, sub, action }) => (
            <button key={label} onClick={action} disabled={addLoading}
              style={{ padding: '16px 20px', fontSize: 15, background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 600, color: '#111' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>
              </div>
            </button>
          ))}
          {addLoading && <div style={{ color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8 }}>⏳ Rémy liest Rezept aus…</div>}
          {addError && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 4 }}>{addError}</div>}
        </div>
      </div>
    )
  }

  if (effectiveAddScreen === 'input-text') {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back" onClick={() => { setAddScreen('options'); setAddError(null) }}>‹</button>
          <h1 style={{ fontSize: 15 }}>📝 Rezepttext einfügen</h1>
        </div>
        <div className="content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea value={addTextVal} onChange={e => setAddTextVal(e.target.value)} placeholder="Rezepttext hier einfügen…" rows={10}
            style={{ width: '100%', fontSize: 13, padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          {addError && <div style={{ color: '#EF4444', fontSize: 13 }}>{addError}</div>}
          <button onClick={() => { if (addTextVal.trim()) void callAusQuelle('text', addTextVal.trim()) }} disabled={addLoading || !addTextVal.trim()}
            style={{ padding: '12px', fontSize: 14, fontWeight: 600, background: addLoading || !addTextVal.trim() ? '#E5E7EB' : '#1D9E75', color: addLoading || !addTextVal.trim() ? '#aaa' : 'white', border: 'none', borderRadius: 12, cursor: addLoading || !addTextVal.trim() ? 'default' : 'pointer' }}>
            {addLoading ? '⏳ Rémy liest aus…' : 'Rezept auslesen'}
          </button>
        </div>
      </div>
    )
  }

  if (effectiveAddScreen === 'input-url') {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back" onClick={() => { setAddScreen('options'); setAddError(null) }}>‹</button>
          <h1 style={{ fontSize: 15 }}>🔗 Rezept-Link</h1>
        </div>
        <div className="content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="url" value={addUrlVal} onChange={e => setAddUrlVal(e.target.value)} placeholder="https://…"
            style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 12, outline: 'none', boxSizing: 'border-box' }} />
          {addError && <div style={{ color: '#EF4444', fontSize: 13 }}>{addError}</div>}
          <button onClick={() => { if (addUrlVal.trim()) void callAusQuelle('url', addUrlVal.trim()) }} disabled={addLoading || !addUrlVal.trim()}
            style={{ padding: '12px', fontSize: 14, fontWeight: 600, background: addLoading || !addUrlVal.trim() ? '#E5E7EB' : '#1D9E75', color: addLoading || !addUrlVal.trim() ? '#aaa' : 'white', border: 'none', borderRadius: 12, cursor: addLoading || !addUrlVal.trim() ? 'default' : 'pointer' }}>
            {addLoading ? '⏳ Rémy liest aus…' : 'Rezept auslesen'}
          </button>
        </div>
      </div>
    )
  }

  if (effectiveAddScreen === 'preview' && previewRezept) {
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setAddScreen('options')}>‹</button>
          <h1 style={{ fontSize: 15 }}>Rezept prüfen</h1>
        </div>
        <div className="content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {renderBasicFields()}
          {renderZutatenEditor()}
          {renderSchritteEditor()}
          {renderQuelleFields()}
          {renderAllergenWarnings()}
          {renderSaveBtn(() => void handlePreviewSave(), !prevName.trim())}
        </div>
      </div>
    )
  }

  if (effectiveAddScreen === 'edit' && editEntry) {
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => { setAddScreen(null); setEditEntry(null) }}>‹</button>
          <h1 style={{ fontSize: 15 }}>✏️ Rezept bearbeiten</h1>
        </div>
        <div className="content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {renderBasicFields()}
          {renderZutatenEditor()}
          {renderSchritteEditor()}
          {renderQuelleFields()}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>Notizen (optional)</div>
            <textarea value={prevNotizen} onChange={e => setPrevNotizen(e.target.value)} placeholder="Persönliche Notizen zum Rezept…" rows={3}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          {renderAllergenWarnings()}
          <button onClick={() => void handleEditSave()} disabled={prevSaving || !prevName.trim()}
            style={{ padding: '14px', fontSize: 15, fontWeight: 700, background: prevSaving || !prevName.trim() ? '#E5E7EB' : '#1D9E75', color: prevSaving || !prevName.trim() ? '#aaa' : 'white', border: 'none', borderRadius: 12, cursor: prevSaving || !prevName.trim() ? 'default' : 'pointer', marginBottom: 8 }}>
            {prevSaving ? '⏳ Wird gespeichert…' : '✓ Änderungen speichern'}
          </button>
        </div>
      </div>
    )
  }

  // ── Modals ───────────────────────────────────────────────────────────────────
  if (modal?.kind === 'bookEntry') {
    const entry = modal.entry
    const allergenWarnings = getSlotAllergenWarnings(entry.rezept)
    return (
      <div className="screen active" style={{ position: 'relative' }}>
        <RecipeModal
          name={entry.rezept.name}
          rezept={entry.rezept}
          onClose={() => setModal(null)}
          canRewrite={canEdit(entry)}
          onAdjust={onUpdateRezept ? async (wunsch) => {
            const { adjustRecipe } = await import('../lib/mealLogic')
            const result = await adjustRecipe(entry.rezept, wunsch, entry.rezept.personenAnzahl ?? 4, '', '', '')
            if (result) await onUpdateRezept(entry.id, result.rezept)
          } : undefined}
          isFavorit={entry.isFavorit}
          onToggleFavorit={onToggleFavorit && !isSelectionMode ? () => void onToggleFavorit(entry.id, !entry.isFavorit) : undefined}
          onDelete={canEdit(entry) && onDeleteRezept ? () => { void onDeleteRezept(entry.id); setModal(null) } : undefined}
          onEdit={canEdit(entry) && onUpdateRezept ? () => handleOpenEdit(entry) : undefined}
          allergieHinweise={allergenWarnings}
          onUebernehmen={isSelectionMode && onSelect ? () => {
            onSelect({ gericht: entry.rezept.name, emoji: entry.rezept.emoji, minuten: entry.rezept.minuten, rezept: entry.rezept, bookEntryId: entry.id })
            onMarkGekocht(entry.id)
          } : undefined}
        />
      </div>
    )
  }

  if (modal?.kind === 'history') {
    const dish = modal.dish
    const isInBook = entries.some(e => e.rezept.name.toLowerCase() === dish.gericht.toLowerCase())
    const allergenWarnings = dish.rezept ? getSlotAllergenWarnings(dish.rezept) : []
    return (
      <div className="screen active" style={{ position: 'relative' }}>
        {dish.rezept ? (
          <RecipeModal
            name={dish.gericht}
            rezept={dish.rezept}
            onClose={() => setModal(null)}
            onSaveToBook={!isInBook && !isSelectionMode && onSaveToBook ? (r) => void handleHistorySaveToBook(r) : undefined}
            savedToBook={savedToBookName === dish.gericht || isInBook}
            saveToBookLoading={saveToBookLoading}
            allergieHinweise={allergenWarnings}
            onUebernehmen={isSelectionMode && onSelect && dish.rezept ? () => {
              onSelect({ gericht: dish.gericht, emoji: dish.emoji, minuten: dish.rezept!.minuten, rezept: dish.rezept! })
            } : undefined}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div className="topbar">
              <button className="back" onClick={() => setModal(null)}>‹</button>
              <h1 style={{ fontSize: 15 }}>{dish.emoji} {dish.gericht}</h1>
            </div>
            <div className="content">
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13 }}>
                Kein Rezept mehr gespeichert.<br />
                <span style={{ fontSize: 12 }}>Zuletzt gekocht am {formatDate(dish.date)}.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main screen ──────────────────────────────────────────────────────────────
  const slotLabel = selectionSlot
    ? `${selectionSlot.tag} ${selectionSlot.slot === 'Mittag' ? 'Mittag' : 'Abend'}`
    : ''

  return (
    <div className="screen active" style={{ overflowY: 'auto' }}>
      <div className="topbar">
        <button className="back" onClick={onBack}>‹</button>
        <h1 style={{ fontSize: isSelectionMode ? 14 : 17 }}>
          {isSelectionMode ? `Rezept wählen – ${slotLabel}` : '📖 Rezepte'}
        </h1>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', background: 'white', flexShrink: 0 }}>
        <button onClick={() => setActiveTab('book')}
          style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === 'book' ? 700 : 400, color: activeTab === 'book' ? '#1D9E75' : '#888', background: 'none', border: 'none', borderBottom: activeTab === 'book' ? '2px solid #1D9E75' : '2px solid transparent', cursor: 'pointer' }}>
          📖 Rezeptbuch</button>
        <button onClick={() => setActiveTab('history')}
          style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === 'history' ? 700 : 400, color: activeTab === 'history' ? '#1D9E75' : '#888', background: 'none', border: 'none', borderBottom: activeTab === 'history' ? '2px solid #1D9E75' : '2px solid transparent', cursor: 'pointer' }}>
          🕒 Zuletzt gekocht</button>
      </div>

      <div className="content" style={{ padding: '0 16px 32px' }}>

        {activeTab === 'book' && (
          <>
            <div style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, paddingTop: 8, paddingBottom: 6 }}>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rezept suchen…"
                style={{ width: '100%', fontSize: 14, padding: '9px 14px', border: '1px solid #E5E7EB', borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {([['name', 'A–Z'], ['gekocht', 'Oft gekocht'], ['recent', 'Zuletzt'], ['rating', '⭐ Bewertung'], ['longAgo', 'Lange nicht gekocht']] as [SortMode, string][]).map(([m, label]) => (
                  <button key={m} onClick={() => setSortMode(m)}
                    style={{ flex: '1 1 auto', padding: '4px 6px', fontSize: 10, border: `1px solid ${sortMode === m ? '#1D9E75' : '#ddd'}`, borderRadius: 6, background: sortMode === m ? '#E1F5EE' : 'white', color: sortMode === m ? '#0F6E56' : '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!isSelectionMode && onSaveToBook && (
              <button onClick={() => { setAddError(null); setAddScreen('options') }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, color: '#1D9E75', background: '#F0FDF8', border: '1px dashed #6EE7B7', borderRadius: 10, cursor: 'pointer', marginTop: 4, marginBottom: 4 }}>
                + Rezept hinzufügen
              </button>
            )}

            {entries.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>
                Noch keine Rezepte gespeichert.<br />
                <span style={{ fontSize: 12 }}>Über ⭐ Ins Rezeptbuch hinzufügen.</span>
              </div>
            )}

            {!search.trim() && favEntries.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⭐ Lieblingsrezepte</div>
                {favEntries.map(entry => {
                  const warns = getSlotAllergenWarnings(entry.rezept)
                  return (
                    <button key={entry.id} onClick={() => setModal({ kind: 'bookEntry', entry })}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 22 }}>{entry.rezept.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {entry.rezept.name}
                          {warns.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>!</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          ⏱ {fmtZeit(entry.rezept.minuten, entry.rezept.arbeitszeitMinuten, entry.rezept.zeitGeschaetzt)}
                          {entry.kategorie && <> · {entry.kategorie}</>}
                          {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
                          {(() => { const avg = computeRatingAvg(dishRatings, entry.rezept.name); return avg ? <> · {fmtAvg(avg.avg, avg.count)}</> : null })()}
                        </div>
                      </div>
                      <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
                    </button>
                  )
                })}
              </>
            )}

            {entries.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📖 Alle Rezepte</div>
                  <div style={{ fontSize: 11, color: '#bbb' }}>{entries.length} Einträge</div>
                </div>
                {filteredEntries.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>Kein Treffer.</div>}
                {filteredEntries.map(entry => {
                  const warns = getSlotAllergenWarnings(entry.rezept)
                  return (
                    <button key={entry.id} onClick={() => setModal({ kind: 'bookEntry', entry })}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 22 }}>{entry.rezept.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {entry.rezept.name}
                          {warns.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>!</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          ⏱ {fmtZeit(entry.rezept.minuten, entry.rezept.arbeitszeitMinuten, entry.rezept.zeitGeschaetzt)}
                          {entry.kategorie && <> · {entry.kategorie}</>}
                          {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
                          {(() => { const avg = computeRatingAvg(dishRatings, entry.rezept.name); return avg ? <> · {fmtAvg(avg.avg, avg.count)}</> : null })()}
                        </div>
                      </div>
                      {entry.isFavorit && <span style={{ fontSize: 14 }}>⭐</span>}
                      <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
                    </button>
                  )
                })}
              </>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            {historyLoading && <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '24px 0' }}>⏳ Wird geladen…</div>}
            {historyLoaded && pastDishes.length === 0 && <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '32px 0' }}>Noch keine Gerichte gekocht.</div>}
            {pastDishes.map((dish, i) => {
              const isInBook = entries.some(e => e.rezept.name.toLowerCase() === dish.gericht.toLowerCase())
              const warns = dish.rezept ? getSlotAllergenWarnings(dish.rezept) : []
              return (
                <div key={i} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: 6, overflow: 'hidden', marginTop: i === 0 ? 12 : 0 }}>
                  <div onClick={() => setModal({ kind: 'history', dish })}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 20 }}>{dish.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {dish.gericht}
                        {warns.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>!</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                        {formatDate(dish.date)}
                        {(() => { const avg = computeRatingAvg(dishRatings, dish.gericht); return avg ? <> · {fmtAvg(avg.avg, avg.count)}</> : null })()}
                      </div>
                    </div>
                    {isInBook && <span style={{ fontSize: 11, color: '#F59E0B', flexShrink: 0 }}>⭐</span>}
                    {!isInBook && savedInlineNames.has(dish.gericht) && (
                      <span style={{ fontSize: 10, color: '#1D9E75', flexShrink: 0, fontWeight: 600 }}>✓ Im Rezeptbuch</span>
                    )}
                    {!isInBook && !savedInlineNames.has(dish.gericht) && dish.rezept && !isSelectionMode && onSaveToBook && (
                      <button onClick={async (ev) => {
                        ev.stopPropagation()
                        await handleHistorySaveToBook(dish.rezept!)
                        setSavedInlineNames(prev => new Set(prev).add(dish.gericht))
                      }} style={{ fontSize: 11, color: '#1D9E75', background: 'none', border: '1px solid #B2DFCC', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>
                        + Rezeptbuch
                      </button>
                    )}
                    <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
                  </div>
                  {onRateGericht && (
                    <div style={{ borderTop: '1px solid #f5f5f5', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, color: '#aaa', marginRight: 2 }}>Wie war's?</span>
                      {[1,2,3,4,5].map(s => {
                        const myRating = dishRatings.find(r => r.gerName.toLowerCase() === dish.gericht.toLowerCase() && r.member === currentUser)?.sterne ?? 0
                        return (
                          <button key={s} onClick={() => onRateGericht(dish.gericht, s, currentUser, dish.rezept ?? undefined)}
                            style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '0 1px', lineHeight: 1, color: s <= myRating ? '#F59E0B' : '#d1d5db' }}>★</button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

      </div>
    </div>
  )
}
