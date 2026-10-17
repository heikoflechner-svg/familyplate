'use client'
import { useState, useEffect } from 'react'
import type { Rezept, WeekPlanEntry, DayAttendance, FamilyMember, Chef } from '../lib/state'
import type { RezeptbuchEntry } from '../lib/state'
import { loadWeekHistory, isFullRecipe } from '../lib/mealLogic'
import { checkAllergens, formatAllergenWarningsCard } from '../lib/allergenCheck'
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
}

type TabMode = 'book' | 'history'

type BookModal =
  | { kind: 'bookEntry'; entry: RezeptbuchEntry }
  | { kind: 'history'; dish: PastDish }
  | null

type SortMode = 'name' | 'gekocht' | 'recent'

export default function RezeptbuchScreen({
  entries, currentUser, canEditSettings, members, mealsData, weekPlan, weekStart,
  attendance, onBack, onSaveToBook, onUpdateRezept, onToggleFavorit, onDeleteRezept, onMarkGekocht,
  selectionSlot, onSelect,
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

  const isSelectionMode = !!selectionSlot

  useEffect(() => {
    if (historyLoaded) return
    setHistoryLoading(true)
    loadWeekHistory(12).then(data => {
      setHistory((data ?? []) as HistoryEntry[])
      setHistoryLoading(false)
      setHistoryLoaded(true)
    })
  }, [historyLoaded])

  function canEdit(entry: RezeptbuchEntry): boolean {
    return !isSelectionMode && (entry.erstelltVon === currentUser || canEditSettings)
  }

  function getSlotAllergenWarnings(rezept: Rezept): string[] {
    if (!selectionSlot || !isFullRecipe(rezept)) return []
    const dayAtt = attendance.find(a => a.tag === selectionSlot.tag)
    if (!dayAtt) return []
    const presentChefs = selectionSlot.slot === 'Mittag' ? dayAtt.mittagAnwesend : dayAtt.abendAnwesend
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
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (const entry of weekPlan) {
        const dayIdx = WOCHENTAGE.indexOf(entry.tag)
        if (dayIdx < 0) continue
        const dayDate = new Date(mon)
        dayDate.setDate(mon.getDate() + dayIdx)
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
    } finally {
      setSaveToBookLoading(false)
    }
  }

  const pastDishes = collectPastDishes()
  const favEntries = entries.filter(e => e.isFavorit)

  function sortEntries(list: RezeptbuchEntry[]): RezeptbuchEntry[] {
    if (sortMode === 'gekocht') return [...list].sort((a, b) => b.malGekocht - a.malGekocht)
    if (sortMode === 'recent') return [...list].sort((a, b) => (b.zuletztGekocht ?? '').localeCompare(a.zuletztGekocht ?? ''))
    return [...list].sort((a, b) => a.rezept.name.localeCompare(b.rezept.name, 'de'))
  }

  const filteredEntries = sortEntries(
    search.trim()
      ? entries.filter(e => e.rezept.name.toLowerCase().includes(search.toLowerCase()))
      : entries
  )

  const M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}. ${M[d.getMonth()]} ${d.getFullYear()}`
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

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', background: 'white', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('book')}
          style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === 'book' ? 700 : 400, color: activeTab === 'book' ? '#1D9E75' : '#888', background: 'none', border: 'none', borderBottom: activeTab === 'book' ? '2px solid #1D9E75' : '2px solid transparent', cursor: 'pointer' }}
        >📖 Rezeptbuch</button>
        <button
          onClick={() => setActiveTab('history')}
          style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === 'history' ? 700 : 400, color: activeTab === 'history' ? '#1D9E75' : '#888', background: 'none', border: 'none', borderBottom: activeTab === 'history' ? '2px solid #1D9E75' : '2px solid transparent', cursor: 'pointer' }}
        >🕒 Zuletzt gekocht</button>
      </div>

      <div className="content" style={{ padding: '0 16px 32px' }}>

        {/* ── Tab: Rezeptbuch ───────────────────────────────────────────────── */}
        {activeTab === 'book' && (
          <>
            <div style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, paddingTop: 8, paddingBottom: 6 }}>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rezept suchen…"
                style={{ width: '100%', fontSize: 14, padding: '9px 14px', border: '1px solid #E5E7EB', borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {(['name', 'gekocht', 'recent'] as SortMode[]).map(m => (
                  <button key={m} onClick={() => setSortMode(m)}
                    style={{ flex: 1, padding: '4px 0', fontSize: 10, border: `1px solid ${sortMode === m ? '#1D9E75' : '#ddd'}`, borderRadius: 6, background: sortMode === m ? '#E1F5EE' : 'white', color: sortMode === m ? '#0F6E56' : '#888', cursor: 'pointer' }}>
                    {m === 'name' ? 'A–Z' : m === 'gekocht' ? 'Oft gekocht' : 'Zuletzt'}
                  </button>
                ))}
              </div>
            </div>

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
                          ⏱ {entry.rezept.minuten} min
                          {entry.kategorie && <> · {entry.kategorie}</>}
                          {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
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
                {filteredEntries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>Kein Treffer.</div>
                )}
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
                          ⏱ {entry.rezept.minuten} min
                          {entry.kategorie && <> · {entry.kategorie}</>}
                          {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
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

        {/* ── Tab: Zuletzt gekocht ─────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <>
            {historyLoading && (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '24px 0' }}>⏳ Wird geladen…</div>
            )}
            {historyLoaded && pastDishes.length === 0 && (
              <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '32px 0' }}>Noch keine Gerichte gekocht.</div>
            )}
            {pastDishes.map((dish, i) => {
              const isInBook = entries.some(e => e.rezept.name.toLowerCase() === dish.gericht.toLowerCase())
              const warns = dish.rezept ? getSlotAllergenWarnings(dish.rezept) : []
              return (
                <button key={i} onClick={() => setModal({ kind: 'history', dish })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', marginBottom: 6, cursor: 'pointer', textAlign: 'left', marginTop: i === 0 ? 12 : 0 }}>
                  <span style={{ fontSize: 20 }}>{dish.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {dish.gericht}
                      {warns.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>!</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{formatDate(dish.date)}</div>
                  </div>
                  {isInBook && <span style={{ fontSize: 11, color: '#F59E0B', flexShrink: 0 }}>⭐</span>}
                  {!isInBook && savedInlineNames.has(dish.gericht) && (
                    <span style={{ fontSize: 10, color: '#1D9E75', flexShrink: 0, fontWeight: 600 }}>✓ Im Rezeptbuch</span>
                  )}
                  {!isInBook && !savedInlineNames.has(dish.gericht) && dish.rezept && !isSelectionMode && onSaveToBook && (
                    <button
                      onClick={async (ev) => {
                        ev.stopPropagation()
                        await handleHistorySaveToBook(dish.rezept!)
                        setSavedInlineNames(prev => new Set(prev).add(dish.gericht))
                      }}
                      style={{ fontSize: 11, color: '#1D9E75', background: 'none', border: '1px solid #B2DFCC', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}
                    >+ Rezeptbuch</button>
                  )}
                  <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
                </button>
              )
            })}
          </>
        )}

      </div>
    </div>
  )
}
