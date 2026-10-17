'use client'
import { useState, useEffect } from 'react'
import type { Rezept, WeekPlanEntry, DayAttendance, FamilyMember, Chef } from '../lib/state'
import type { RezeptbuchEntry } from '../lib/state'
import { loadWeekHistory } from '../lib/mealLogic'
import RecipeModal from './RecipeModal'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

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
  onSaveToBook: (rezept: Rezept) => Promise<void>
  onUpdateRezept: (id: string, rezept: Rezept) => Promise<void>
  onToggleFavorit: (id: string, isFavorit: boolean) => Promise<void>
  onDeleteRezept: (id: string) => Promise<void>
  onMarkGekocht: (id: string) => void
}

type ModalState =
  | { kind: 'bookEntry'; entry: RezeptbuchEntry }
  | { kind: 'history'; dish: PastDish }
  | null

export default function RezeptbuchScreen({
  entries, currentUser, canEditSettings, mealsData, weekPlan, weekStart,
  onBack, onSaveToBook, onUpdateRezept, onToggleFavorit, onDeleteRezept, onMarkGekocht,
}: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [saveToBookLoading, setSaveToBookLoading] = useState(false)
  const [savedToBookName, setSavedToBookName] = useState<string | null>(null)

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
    return entry.erstelltVon === currentUser || canEditSettings
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

    return result.slice(0, 20)
  }

  async function handleHistorySaveToBook(rezept: Rezept) {
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
  const filteredEntries = search.trim()
    ? entries.filter(e => e.rezept.name.toLowerCase().includes(search.toLowerCase()))
    : entries

  const M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}. ${M[d.getMonth()]} ${d.getFullYear()}`
  }

  if (modal?.kind === 'bookEntry') {
    const entry = modal.entry
    return (
      <div className="screen active" style={{ position: 'relative' }}>
        <RecipeModal
          name={entry.rezept.name}
          rezept={entry.rezept}
          onClose={() => setModal(null)}
          canRewrite={canEdit(entry)}
          onAdjust={async (wunsch) => {
            const { adjustRecipe } = await import('../lib/mealLogic')
            const result = await adjustRecipe(entry.rezept, wunsch, entry.rezept.personenAnzahl ?? 4, '', '', '')
            if (result) await onUpdateRezept(entry.id, result.rezept)
          }}
          isFavorit={entry.isFavorit}
          onToggleFavorit={() => void onToggleFavorit(entry.id, !entry.isFavorit)}
          onDelete={canEdit(entry) ? () => { void onDeleteRezept(entry.id); setModal(null) } : undefined}
        />
      </div>
    )
  }

  if (modal?.kind === 'history') {
    const dish = modal.dish
    const isInBook = entries.some(e => e.rezept.name.toLowerCase() === dish.gericht.toLowerCase())
    return (
      <div className="screen active" style={{ position: 'relative' }}>
        {dish.rezept ? (
          <RecipeModal
            name={dish.gericht}
            rezept={dish.rezept}
            onClose={() => setModal(null)}
            onSaveToBook={!isInBook ? (r) => void handleHistorySaveToBook(r) : undefined}
            savedToBook={savedToBookName === dish.gericht || isInBook}
            saveToBookLoading={saveToBookLoading}
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

  return (
    <div className="screen active" style={{ overflowY: 'auto' }}>
      <div className="topbar">
        <button className="back" onClick={onBack}>‹</button>
        <h1>📖 Rezepte</h1>
      </div>
      <div className="content" style={{ padding: '0 16px 32px' }}>

        <div style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, paddingTop: 8, paddingBottom: 8 }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rezept suchen…"
            style={{ width: '100%', fontSize: 14, padding: '9px 14px', border: '1px solid #E5E7EB', borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }}
          />
        </div>

        {favEntries.length > 0 && !search.trim() && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⭐ Lieblingsrezepte</div>
            {favEntries.map(entry => (
              <button key={entry.id} onClick={() => setModal({ kind: 'bookEntry', entry })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 22 }}>{entry.rezept.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{entry.rezept.name}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    ⏱ {entry.rezept.minuten} min
                    {entry.kategorie && <> · {entry.kategorie}</>}
                    {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
                  </div>
                </div>
                <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
              </button>
            ))}
          </>
        )}

        {!search.trim() && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🕒 Zuletzt gekocht</div>
            {historyLoading && (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>⏳ Wird geladen…</div>
            )}
            {historyLoaded && pastDishes.length === 0 && (
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>Noch keine Gerichte gekocht.</div>
            )}
            {pastDishes.map((dish, i) => {
              const isInBook = entries.some(e => e.rezept.name.toLowerCase() === dish.gericht.toLowerCase())
              return (
                <button key={i} onClick={() => setModal({ kind: 'history', dish })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', marginBottom: 6, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 20 }}>{dish.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{dish.gericht}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{formatDate(dish.date)}</div>
                  </div>
                  {isInBook && <span style={{ fontSize: 11, color: '#F59E0B', flexShrink: 0 }}>⭐</span>}
                  {!isInBook && dish.rezept && <span style={{ fontSize: 10, color: '#1D9E75', flexShrink: 0 }}>+ Buch</span>}
                  <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
                </button>
              )
            })}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📖 Alle Rezepte</div>
          <div style={{ fontSize: 11, color: '#bbb' }}>{entries.length} Einträge</div>
        </div>

        {filteredEntries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>
            {search.trim() ? 'Kein Treffer.' : 'Noch keine Rezepte gespeichert.'}
          </div>
        )}
        {filteredEntries.map(entry => (
          <button key={entry.id} onClick={() => setModal({ kind: 'bookEntry', entry })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 22 }}>{entry.rezept.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{entry.rezept.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                ⏱ {entry.rezept.minuten} min
                {entry.kategorie && <> · {entry.kategorie}</>}
                {entry.malGekocht > 0 && <> · {entry.malGekocht}× gekocht</>}
              </div>
            </div>
            {entry.isFavorit && <span style={{ fontSize: 14 }}>⭐</span>}
            <span style={{ color: '#bbb', fontSize: 16 }}>›</span>
          </button>
        ))}

      </div>
    </div>
  )
}
