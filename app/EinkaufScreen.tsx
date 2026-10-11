'use client'
import { useState, useEffect, useRef } from 'react'
import {
  generateShoppingList,
  groupShoppingByMeal,
  consolidateShoppingList,
  groupByLaden,
  toggleConsolidatedItem,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCompleted,
  computeNextWeekCoverage,
} from '../lib/shoppingLogic'
import type { ConsolidatedItem } from '../lib/shoppingLogic'
import { generateRecipe, isFullRecipe, getPersonCountForSlot, getNextMondayIso } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import { buildFamilyPrompt, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem, Chef, NextWeekData, FreezerItem, PantryItem, FamilyMember, DayAttendance } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function todayGerman(): string {
  return WOCHENTAGE[(new Date().getDay() + 6) % 7]
}

function getKW(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  const days = Math.round((thu.getTime() - yearStart.getTime()) / 86400000)
  return Math.ceil((days + 1) / 7)
}

interface Props {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => void
  onMealsDataChange: (meals: Record<string, Rezept>) => Promise<void>
  currentUser: Chef | null
  wochenchef: Chef
  shopDone: boolean
  onShopDoneChange: (done: boolean) => void
  laeden: string[]
  zutatenLaden: Record<string, string>
  onZutatenLadenChange: (mapping: Record<string, string>) => Promise<void>
  canEditSettings: boolean
  planConfirmed?: boolean
  attendance?: DayAttendance[]
  shoppingDays?: string[]
  nextWeekData?: NextWeekData | null
  freezerItems: FreezerItem[]
  pantryItems: PantryItem[]
  members: FamilyMember[]
  onNextWeekDataChange?: (data: Partial<NextWeekData>, nextMonday: string) => Promise<void>
  weekStart?: string | null
  nextWeekStart?: string | null
}

type ViewMode = 'tag' | 'zusammen' | 'laden'

export default function EinkaufScreen({ weekPlan, mealsData, shoppingList, onShoppingListChange, onMealsDataChange, currentUser, wochenchef, shopDone, onShopDoneChange, laeden, zutatenLaden, onZutatenLadenChange, canEditSettings, planConfirmed = false, attendance = [], shoppingDays = [], nextWeekData = null, freezerItems, pantryItems, members, onNextWeekDataChange, weekStart = null, nextWeekStart = null }: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['alle']))
  const [selectedNextWeekDays, setSelectedNextWeekDays] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('tag')
  const autoLoadDoneRef = useRef(false)
  const [weekTab, setWeekTab] = useState<'current' | 'next'>('current')
  const [nwDayPickerOpen, setNwDayPickerOpen] = useState(false)
  const [nwSelectedDays, setNwSelectedDays] = useState<Set<string>>(new Set())
  const [nwGenerating, setNwGenerating] = useState(false)
  const nwAutoLoadRef = useRef(false)

  // Computed NW values (before effects so closures capture them correctly)
  const nwPlan = nextWeekData?.plan ?? []
  const nwMeals = nextWeekData?.mealsData ?? {}
  const nwConfirmed = nextWeekData?.planConfirmed ?? false
  const nwShoppingList = nextWeekData?.shoppingList ?? []
  const nwCoverageDays = computeNextWeekCoverage(shoppingDays)
  const nwAvailableDays = nwCoverageDays.filter(d => nwPlan.some(e => e.tag === d))
  // Days of NW that are NOT already covered by current-list (Punkt 3)
  const nwListableDays = WOCHENTAGE.filter(d => nwPlan.some(e => e.tag === d) && !nwCoverageDays.includes(d))
  const showNwTab = nwConfirmed && nwPlan.length > 0

  // Auto-load missing recipes for current week (unchanged)
  useEffect(() => {
    if (!planConfirmed || weekPlan.length === 0 || autoLoadDoneRef.current) return
    const hasMissing = weekPlan.some(e => !isFullRecipe(mealsData[e.gericht]))
    if (!hasMissing) { autoLoadDoneRef.current = true; return }
    autoLoadDoneRef.current = true
    const freezerStr = getFreezerListString(freezerItems)
    const pantryStr = getPantryListString(pantryItems)
    const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)
    const mbs = members.length ? members : DEFAULT_MEMBERS
    const store = { ...mealsData }
    const seen = new Set<string>()
    const missing = weekPlan.filter(e => {
      if (seen.has(e.gericht) || isFullRecipe(store[e.gericht])) return false
      seen.add(e.gericht)
      return true
    })
    void Promise.all(missing.map(async e => {
      const personCount = getPersonCountForSlot(e.tag, e.slot, attendance, mbs)
      const r = await generateRecipe(e.gericht, e.emoji, freezerStr, pantryStr, familyPrompt, personCount)
      if (r) store[e.gericht] = { ...r, personenAnzahl: personCount, ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []) }
    })).then(() => onMealsDataChange(store))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planConfirmed])

  // Punkt 5: remove past-meal items on mount
  useEffect(() => {
    const todayIdx = WOCHENTAGE.indexOf(todayGerman())
    const cleaned = shoppingList.filter(i => !i.gericht || !i.tag || WOCHENTAGE.indexOf(i.tag) >= todayIdx)
    if (cleaned.length < shoppingList.length) onShoppingListChange(cleaned)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Punkt 2: auto-generate NW shopping list when confirmed and empty
  useEffect(() => {
    if (!nwConfirmed) {
      nwAutoLoadRef.current = false
      return
    }
    if (nwPlan.length === 0 || !onNextWeekDataChange) return
    if (nwShoppingList.length > 0) return
    if (nwAutoLoadRef.current) return
    nwAutoLoadRef.current = true

    void (async () => {
      const daysToInclude = nwListableDays
      if (daysToInclude.length === 0) return
      const store = { ...nwMeals }
      const seen = new Set<string>()
      const missing = nwPlan.filter(e => {
        if (seen.has(e.gericht) || isFullRecipe(store[e.gericht])) return false
        seen.add(e.gericht)
        return true
      })
      if (missing.length > 0) {
        const freezerStr = getFreezerListString(freezerItems)
        const pantryStr = getPantryListString(pantryItems)
        const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)
        await Promise.all(missing.map(async e => {
          const r = await generateRecipe(e.gericht, e.emoji, freezerStr, pantryStr, familyPrompt)
          if (r) store[e.gericht] = { ...r, ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []) }
        }))
      }
      const list = generateShoppingList(nwPlan, store, daysToInclude)
      await onNextWeekDataChange({ shoppingList: list, mealsData: store }, nextWeekStart ?? getNextMondayIso())
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nwConfirmed, nwPlan.length])

  const plannedDays = WOCHENTAGE.filter(t => weekPlan.some(e => e.tag === t))

  // Current week day picker
  function toggleDay(day: string) {
    const s = new Set(selectedDays)
    if (day === 'alle') {
      setSelectedDays(s.has('alle') ? new Set<string>() : new Set(['alle']))
      return
    }
    s.delete('alle')
    s.has(day) ? s.delete(day) : s.add(day)
    if (s.size === 0) s.add('alle')
    setSelectedDays(s)
  }

  function toggleNextWeekDay(day: string) {
    const s = new Set(selectedNextWeekDays)
    s.has(day) ? s.delete(day) : s.add(day)
    setSelectedNextWeekDays(s)
  }

  function openDayPicker() {
    setSelectedDays(new Set(['alle']))
    setSelectedNextWeekDays(nwConfirmed ? new Set(nwAvailableDays) : new Set())
    setDayPickerOpen(true)
  }

  async function confirmGenerate() {
    const days = selectedDays.has('alle') ? undefined : [...selectedDays]
    const nwDays = selectedNextWeekDays.size > 0 ? [...selectedNextWeekDays] : undefined

    setGenerating(true)
    try {
      const freezerStr = getFreezerListString(freezerItems)
      const pantryStr = getPantryListString(pantryItems)
      const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)

      const thisWeekEntries = days ? weekPlan.filter(e => days.includes(e.tag)) : weekPlan
      const nwEntries = nwDays ? nwPlan.filter(e => nwDays.includes(e.tag)) : []

      const thisWeekMeals = { ...mealsData }
      const nextWeekMeals = { ...nwMeals }

      async function loadInto(entries: WeekPlanEntry[], store: Record<string, Rezept>) {
        const seen = new Set<string>()
        const missing = entries.filter(e => {
          if (seen.has(e.gericht) || isFullRecipe(store[e.gericht])) return false
          seen.add(e.gericht)
          return true
        })
        await Promise.all(missing.map(async e => {
          const r = await generateRecipe(e.gericht, e.emoji, freezerStr, pantryStr, familyPrompt)
          if (r) {
            store[e.gericht] = {
              ...r,
              ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []),
            }
          }
        }))
      }

      await loadInto(thisWeekEntries, thisWeekMeals)
      if (nwDays) await loadInto(nwEntries, nextWeekMeals)

      await onMealsDataChange(thisWeekMeals)

      onShoppingListChange(generateShoppingList(
        weekPlan, thisWeekMeals, days,
        nwDays ? nwPlan : undefined,
        nwDays ? nextWeekMeals : undefined,
        nwDays,
      ))
      setDayPickerOpen(false)
    } finally {
      setGenerating(false)
    }
  }

  // NW day picker
  function openNwDayPicker() {
    setNwSelectedDays(new Set(nwListableDays))
    setNwDayPickerOpen(true)
  }

  function toggleNwDay(day: string) {
    const s = new Set(nwSelectedDays)
    s.has(day) ? s.delete(day) : s.add(day)
    setNwSelectedDays(s)
  }

  async function confirmNwGenerate() {
    const daysToInclude = nwSelectedDays.size > 0 ? [...nwSelectedDays] : nwListableDays
    setNwGenerating(true)
    try {
      const store = { ...nwMeals }
      const seen = new Set<string>()
      const missing = nwPlan.filter(e => {
        if (seen.has(e.gericht) || isFullRecipe(store[e.gericht])) return false
        seen.add(e.gericht)
        return true
      })
      if (missing.length > 0) {
        const freezerStr = getFreezerListString(freezerItems)
        const pantryStr = getPantryListString(pantryItems)
        const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)
        await Promise.all(missing.map(async e => {
          const r = await generateRecipe(e.gericht, e.emoji, freezerStr, pantryStr, familyPrompt)
          if (r) store[e.gericht] = { ...r, ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []) }
        }))
      }
      const list = generateShoppingList(nwPlan, store, daysToInclude)
      await onNextWeekDataChange?.({ shoppingList: list, mealsData: store }, nextWeekStart ?? getNextMondayIso())
      setNwDayPickerOpen(false)
    } finally {
      setNwGenerating(false)
    }
  }

  // Current week operations
  function toggle(id: string) { onShoppingListChange(toggleShoppingItem(shoppingList, id)) }
  function remove(id: string) { onShoppingListChange(removeShoppingItem(shoppingList, id)) }
  function toggleConsolidated(ids: string[]) { onShoppingListChange(toggleConsolidatedItem(shoppingList, ids)) }

  // NW operations
  function nwUpdate(updated: ShoppingItem[]) {
    void onNextWeekDataChange?.({ shoppingList: updated }, nextWeekStart ?? getNextMondayIso())
  }

  // Active list abstraction
  const isNwTab = weekTab === 'next'
  const activeList = isNwTab ? nwShoppingList : shoppingList
  const activeWeekPlan = isNwTab ? nwPlan : weekPlan
  const activeMeals = isNwTab ? nwMeals : mealsData

  function activeToggle(id: string) { isNwTab ? nwUpdate(toggleShoppingItem(nwShoppingList, id)) : toggle(id) }
  function activeRemove(id: string) { isNwTab ? nwUpdate(removeShoppingItem(nwShoppingList, id)) : remove(id) }
  function activeToggleConsolidated(ids: string[]) { isNwTab ? nwUpdate(toggleConsolidatedItem(nwShoppingList, ids)) : toggleConsolidated(ids) }

  function addManual() {
    if (!newName.trim()) return
    onShoppingListChange(addShoppingItem(shoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  function addManualNw() {
    if (!newName.trim()) return
    nwUpdate(addShoppingItem(nwShoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  // Derived from active list
  // fromLastWeek items are only in current list; exclude them from normal manualItems display
  const fromLastWeekItems = !isNwTab ? shoppingList.filter(i => i.fromLastWeek) : []
  const recipeItems = activeList.filter(i => i.gericht)
  const manualItems = activeList.filter(i => !i.gericht && !i.fromLastWeek)
  const hasNwItems = !isNwTab && recipeItems.some(i => i.nextWeek)
  const groups = groupShoppingByMeal(recipeItems, activeWeekPlan, (!isNwTab && hasNwItems) ? nwPlan : undefined)
  const consolidated = consolidateShoppingList(recipeItems)
  const doneCount = activeList.filter(i => i.erledigt).length
  const dayCount = new Set(recipeItems.map(i => i.tag)).size
  const gerichtCount = new Set(recipeItems.map(i => i.gericht)).size

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>🛒 Einkauf</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {(isNwTab ? nwShoppingList.length > 0 : shoppingList.length > 0) && (
            <button
              onClick={isNwTab ? openNwDayPicker : openDayPicker}
              style={{ border: 'none', background: 'none', color: '#1D9E75', fontSize: 12, cursor: 'pointer' }}
            >
              🔄 Neu
            </button>
          )}
          {doneCount > 0 && (
            <button
              onClick={() => isNwTab ? nwUpdate(clearCompleted(nwShoppingList)) : onShoppingListChange(clearCompleted(shoppingList))}
              style={{ border: 'none', background: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer' }}
            >
              Erledigtes löschen
            </button>
          )}
        </div>
      </div>
      <div className="content">

        {/* Umschalter Diese Woche / Nächste Woche (Punkt 4) */}
        {showNwTab && (
          <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            <button
              onClick={() => setWeekTab('current')}
              style={{ flex: 1, padding: '9px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: weekTab === 'current' ? 700 : 400, background: weekTab === 'current' ? '#1D9E75' : 'white', color: weekTab === 'current' ? 'white' : '#666' }}
            >
              Diese Woche{weekStart ? ` (KW ${getKW(weekStart)})` : ''}
            </button>
            <button
              onClick={() => setWeekTab('next')}
              style={{ flex: 1, padding: '9px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: weekTab === 'next' ? 700 : 400, background: weekTab === 'next' ? '#1D9E75' : 'white', color: weekTab === 'next' ? 'white' : '#666' }}
            >
              Nächste Woche{nextWeekStart ? ` (KW ${getKW(nextWeekStart)})` : ''}
            </button>
          </div>
        )}

        {/* NW coverage warning (current week tab only) */}
        {!isNwTab && nwCoverageDays.length > 0 && !nwConfirmed && (
          <div style={{ background: '#FFF3CD', border: '1px solid #FFC107', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#856404', marginBottom: 2 }}>
              ⚠️ Nächste Woche noch nicht freigegeben
            </div>
            <div style={{ fontSize: 11, color: '#664d00' }}>
              {shoppingDays.length > 0 ? `${shoppingDays[shoppingDays.length - 1]}s` : 'Der'} Einkauf deckt auch <strong>{nwCoverageDays.join(', ')}</strong> der nächsten Woche ab – aber der Plan ist noch nicht freigegeben.
            </div>
          </div>
        )}

        {/* Current week day picker */}
        {!isNwTab && dayPickerOpen && (
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #eee' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 }}>
              Für welche Tage einkaufen?
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                className={`menu-tab${selectedDays.has('alle') ? ' on' : ''}`}
                onClick={() => toggleDay('alle')}
              >
                Alle
              </button>
              {plannedDays.map(t => (
                <button
                  key={t}
                  className={`menu-tab${selectedDays.has('alle') || selectedDays.has(t) ? ' on' : ''}`}
                  onClick={() => toggleDay(t)}
                >
                  {t.slice(0, 2)}
                </button>
              ))}
            </div>
            {nwCoverageDays.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 500 }}>
                  Nächste Woche miteinschließen:
                </div>
                {nwConfirmed && nwAvailableDays.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {nwAvailableDays.map(d => (
                      <button
                        key={d}
                        className={`menu-tab${selectedNextWeekDays.has(d) ? ' on' : ''}`}
                        onClick={() => toggleNextWeekDay(d)}
                      >
                        {d.slice(0, 2)} ⁺¹
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#CC8800', background: '#FFF3CD', borderRadius: 6, padding: '5px 10px' }}>
                    ⚠️ Nächste Woche ({nwCoverageDays.join(', ')}) noch nicht freigegeben
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                onClick={confirmGenerate}
                disabled={generating}
                style={{ flex: 1, padding: '10px', opacity: generating ? 0.6 : 1, cursor: generating ? 'default' : 'pointer' }}
              >
                {generating ? '🐀 Rémy holt Rezepte…' : '📋 Liste erstellen'}
              </button>
              <button
                onClick={() => setDayPickerOpen(false)}
                disabled={generating}
                style={{ padding: '10px 16px', border: '1px solid #ddd', borderRadius: 10, background: 'white', cursor: generating ? 'default' : 'pointer', color: '#888', fontSize: 13, opacity: generating ? 0.6 : 1 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* NW day picker */}
        {isNwTab && nwDayPickerOpen && (
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #eee' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 }}>
              Nächste Woche – für welche Tage einkaufen?
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {nwListableDays.map(d => (
                <button
                  key={d}
                  className={`menu-tab${nwSelectedDays.has(d) ? ' on' : ''}`}
                  onClick={() => toggleNwDay(d)}
                >
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
            {nwCoverageDays.length > 0 && (
              <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
                {nwCoverageDays.join(', ')} bereits in dieser Woche eingeplant
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                onClick={confirmNwGenerate}
                disabled={nwGenerating}
                style={{ flex: 1, padding: '10px', opacity: nwGenerating ? 0.6 : 1, cursor: nwGenerating ? 'default' : 'pointer' }}
              >
                {nwGenerating ? '🐀 Rémy holt Rezepte…' : '📋 Liste erstellen'}
              </button>
              <button
                onClick={() => setNwDayPickerOpen(false)}
                disabled={nwGenerating}
                style={{ padding: '10px 16px', border: '1px solid #ddd', borderRadius: 10, background: 'white', cursor: nwGenerating ? 'default' : 'pointer', color: '#888', fontSize: 13, opacity: nwGenerating ? 0.6 : 1 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Missing recipes warning */}
        {(() => {
          const missing = activeList.length > 0
            ? activeWeekPlan.filter(e => !isFullRecipe(activeMeals[e.gericht]))
            : []
          if (missing.length === 0) return null
          return (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>
                ⚠️ Fehlende Rezepte ({missing.length})
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                Für diese Gerichte fehlen Zutaten in der Einkaufsliste:
              </div>
              {missing.map(e => (
                <div key={`${e.tag}-${e.slot}`} style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>
                  {e.emoji} {e.gericht} · {e.tag} {e.slot === 'Mittag' ? '🌞' : '🌙'}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Empty state */}
        {activeList.length === 0 && !dayPickerOpen && !nwDayPickerOpen && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>
              {activeWeekPlan.length === 0
                ? 'Zuerst den Wochenplan erstellen.'
                : isNwTab
                  ? '🐀 Rémy erstellt die Einkaufsliste…'
                  : 'Einkaufsliste aus dem Wochenplan generieren?'}
            </div>
            {activeWeekPlan.length > 0 && !isNwTab && (
              <button
                className="btn primary"
                style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }}
                onClick={openDayPicker}
              >
                📋 Liste generieren
              </button>
            )}
            {activeWeekPlan.length > 0 && isNwTab && (
              <button
                className="btn primary"
                style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }}
                onClick={openNwDayPicker}
              >
                📋 Liste generieren
              </button>
            )}
          </div>
        )}

        {/* Punkt 1: "Noch offen aus letzter Woche" box */}
        {fromLastWeekItems.length > 0 && (
          <div style={{ background: '#FFF9F0', border: '1px solid #FFD8A0', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8B4E00', marginBottom: 4 }}>⏳ Noch offen aus letzter Woche</div>
            {fromLastWeekItems.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggle(item.id)} onRemove={() => remove(item.id)} />
            ))}
          </div>
        )}

        {activeList.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              {recipeItems.length > 0 && (
                <span style={{ fontSize: 11, color: '#aaa', flex: 1 }}>
                  {dayCount} {dayCount === 1 ? 'Tag' : 'Tage'} · {gerichtCount} {gerichtCount === 1 ? 'Gericht' : 'Gerichte'} · {doneCount}/{activeList.length} erledigt
                </span>
              )}
              {(recipeItems.length > 0 || manualItems.length > 0) && (
                <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {([['tag', 'Nach Tag'], ['zusammen', 'Zusammengefasst'], ['laden', 'Nach Laden']] as [ViewMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
                        background: viewMode === mode ? '#1D9E75' : 'white',
                        color: viewMode === mode ? 'white' : '#888',
                        fontWeight: viewMode === mode ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {viewMode === 'tag' && (
              <>
                {groups.map(group => (
                  <div key={`${group.tag}-${group.slot}-${group.gericht}`} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingBottom: 4, borderBottom: '1.5px solid #eee' }}>
                      <span style={{ fontSize: 11 }}>{group.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: group.nextWeek ? '#1D6E9E' : '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        {group.tag.slice(0, 2)} · {group.slot}{group.nextWeek ? ' · NW' : ''}
                      </span>
                      <span style={{ fontSize: 13, marginLeft: 4 }}>{group.emoji}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{group.gericht}</span>
                    </div>
                    {group.items.map(item => (
                      <ItemRow key={item.id} item={item} onToggle={() => activeToggle(item.id)} onRemove={() => activeRemove(item.id)} />
                    ))}
                  </div>
                ))}
              </>
            )}

            {viewMode === 'zusammen' && (
              <>
                {consolidated.map(item => (
                  <ConsolidatedRow key={item.name} item={item} onToggle={() => activeToggleConsolidated(item.ids)} />
                ))}
              </>
            )}

            {viewMode === 'laden' && (
              <>
                {groupByLaden(recipeItems, zutatenLaden, laeden).map(group => (
                  <div key={group.laden} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, paddingBottom: 4, borderBottom: '1.5px solid #eee' }}>
                      {group.unassigned ? 'Noch keinem Laden zugeordnet' : group.laden}
                    </div>
                    {group.items.map(item => (
                      <div key={item.name}>
                        <ConsolidatedRow item={item} onToggle={() => activeToggleConsolidated(item.ids)} />
                        {group.unassigned ? (
                          canEditSettings ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 42, paddingBottom: 10, marginTop: -4 }}>
                              {laeden.map(l => (
                                <button
                                  key={l}
                                  onClick={() => onZutatenLadenChange({ ...zutatenLaden, [item.name.toLowerCase()]: l })}
                                  style={{ fontSize: 10, padding: '3px 10px', border: '1px solid #ddd', borderRadius: 12, background: '#f5f5f5', cursor: 'pointer', color: '#555' }}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          ) : null
                        ) : (
                          canEditSettings ? (
                            <div style={{ paddingLeft: 42, paddingBottom: 8, marginTop: -4 }}>
                              <button
                                onClick={() => {
                                  const next = { ...zutatenLaden }
                                  delete next[item.name.toLowerCase()]
                                  onZutatenLadenChange(next)
                                }}
                                style={{ fontSize: 10, padding: '2px 8px', border: '1px solid #ddd', borderRadius: 12, background: '#f0f8f5', cursor: 'pointer', color: '#1D9E75' }}
                              >
                                {group.laden} ×
                              </button>
                            </div>
                          ) : null
                        )}
                      </div>
                    ))}
                    {!group.unassigned && manualItems
                      .filter(mi => zutatenLaden[mi.name.toLowerCase()] === group.laden)
                      .map(mi => {
                        const key = mi.name.toLowerCase()
                        return (
                          <div key={mi.id}>
                            <ItemRow item={mi} onToggle={() => activeToggle(mi.id)} onRemove={() => activeRemove(mi.id)} />
                            <div style={{ paddingLeft: 42, paddingBottom: 8, marginTop: -4 }}>
                              <button
                                onClick={() => { const next = { ...zutatenLaden }; delete next[key]; onZutatenLadenChange(next) }}
                                style={{ fontSize: 10, padding: '2px 8px', border: '1px solid #ddd', borderRadius: 12, background: '#f0f8f5', cursor: 'pointer', color: '#1D9E75' }}
                              >
                                {group.laden} ×
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ))}

                {manualItems.filter(i => !zutatenLaden[i.name.toLowerCase()]).length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, paddingBottom: 4, borderBottom: '1.5px solid #eee' }}>
                      Weitere Artikel
                    </div>
                    {manualItems.filter(i => !zutatenLaden[i.name.toLowerCase()]).map(item => {
                      const key = item.name.toLowerCase()
                      return (
                        <div key={item.id}>
                          <ItemRow item={item} onToggle={() => activeToggle(item.id)} onRemove={() => activeRemove(item.id)} />
                          {canEditSettings && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 42, paddingBottom: 10, marginTop: -4 }}>
                              {laeden.map(l => (
                                <button
                                  key={l}
                                  onClick={() => onZutatenLadenChange({ ...zutatenLaden, [key]: l })}
                                  style={{ fontSize: 10, padding: '3px 10px', border: '1px solid #ddd', borderRadius: 12, background: '#f5f5f5', cursor: 'pointer', color: '#555' }}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {manualItems.length > 0 && viewMode !== 'laden' && (
              <div style={{ marginBottom: 16 }}>
                <div className="lbl">Weitere Artikel</div>
                {manualItems.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={() => activeToggle(item.id)} onRemove={() => activeRemove(item.id)} />
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <div className="lbl">Manuell hinzufügen</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (isNwTab ? addManualNw() : addManual())}
              placeholder="Artikel"
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
            />
            <input
              value={newMenge}
              onChange={e => setNewMenge(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (isNwTab ? addManualNw() : addManual())}
              placeholder="Menge"
              style={{ width: 76, border: '1px solid #ddd', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={isNwTab ? addManualNw : addManual}
              style={{ border: 'none', background: '#1D9E75', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >+</button>
          </div>
        </div>

        {/* "Einkauf erledigt" only for current week */}
        {!isNwTab && currentUser === wochenchef && !shopDone && shoppingList.length > 0 && (
          <div style={{ marginTop: 24, borderTop: '2px solid #f0f0f0', paddingTop: 20 }}>
            <button
              onClick={() => onShopDoneChange(true)}
              style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: 14,
                background: '#1D9E75', color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ✓ Einkauf erledigt
            </button>
          </div>
        )}

        {!isNwTab && shopDone && (
          <div style={{ marginTop: 24, textAlign: 'center', color: '#1D9E75', fontSize: 13, fontWeight: 600, padding: '12px 0' }}>
            ✓ Einkauf abgeschlossen
          </div>
        )}

      </div>
    </div>
  )
}

function ItemRow({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void }) {
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isErsatz ? '#2563EB' : '#111'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <Checkbox checked={item.erledigt} onToggle={onToggle} />
      <div style={{ flex: 1, textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
        {item.name}
        {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
      </div>
      <button
        onClick={onRemove}
        style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
      >×</button>
    </div>
  )
}

function ConsolidatedRow({ item, onToggle }: { item: ConsolidatedItem; onToggle: () => void }) {
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isErsatz ? '#2563EB' : '#111'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0 9px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <Checkbox checked={item.erledigt} onToggle={onToggle} />
      <div style={{ flex: 1 }}>
        <div style={{ textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
          {item.name}
          {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
        </div>
        {item.sources.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {item.sources.map((s, i) => (
              <span key={i} style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                {s.tag.slice(0, 2)} {s.slot === 'Mittag' ? '🌞' : '🌙'} · {s.gericht}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
        border: `1.5px solid ${checked ? '#1D9E75' : '#ccc'}`,
        background: checked ? '#1D9E75' : '#fff',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 12,
      }}
    >
      {checked ? '✓' : ''}
    </div>
  )
}
