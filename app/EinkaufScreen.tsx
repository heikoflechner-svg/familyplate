'use client'
import { useState, useEffect, useRef } from 'react'
import {
  generateShoppingList,
  groupShoppingByMeal,
  consolidateShoppingList,
  groupByLaden,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCompleted,
  computeNextWeekCoverage,
} from '../lib/shoppingLogic'
import type { ConsolidatedItem } from '../lib/shoppingLogic'
import { generateRecipe, isFullRecipe, getPersonCountForSlot, getMondayIso, getNextMondayIso } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import { buildFamilyPrompt, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem, Chef, NextWeekData, FreezerItem, PantryItem, FamilyMember, DayAttendance } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const SEL_KEY = 'einkauf-day-sel'

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

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTagIsoDate(tag: string, mondayIso: string): string {
  const idx = WOCHENTAGE.indexOf(tag)
  if (idx < 0) return ''
  const d = new Date(mondayIso + 'T00:00:00')
  d.setDate(d.getDate() + idx)
  return toIsoDate(d)
}

function todayIso(): string {
  return toIsoDate(new Date())
}

interface BarDay {
  isoDate: string
  tag: string
  label: string
  isNw: boolean
}

function computeAutoSelection(barDays: BarDay[], shoppingDays: string[]): Set<string> {
  if (barDays.length === 0) return new Set()
  if (shoppingDays.length === 0) return new Set(barDays.map(d => d.isoDate))
  const shopDaySet = new Set(shoppingDays)
  const cutoffIdx = barDays.findIndex(bd => shopDaySet.has(bd.tag))
  const end = cutoffIdx >= 0 ? cutoffIdx : barDays.length - 1
  return new Set(barDays.slice(0, end + 1).map(bd => bd.isoDate))
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

export default function EinkaufScreen({
  weekPlan, mealsData, shoppingList, onShoppingListChange, onMealsDataChange,
  currentUser, wochenchef, shopDone, onShopDoneChange, laeden, zutatenLaden,
  onZutatenLadenChange, canEditSettings, planConfirmed = false, attendance = [],
  shoppingDays = [], nextWeekData = null, freezerItems, pantryItems, members,
  onNextWeekDataChange, weekStart = null, nextWeekStart = null,
}: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['alle']))
  const [selectedNwPickerDays, setSelectedNwPickerDays] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('tag')
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const autoLoadDoneRef = useRef(false)
  const nwAutoLoadRef = useRef(false)
  const selInitRef = useRef(false)

  // Computed NW values
  const nwPlan = nextWeekData?.plan ?? []
  const nwMeals = nextWeekData?.mealsData ?? {}
  const nwConfirmed = nextWeekData?.planConfirmed ?? false
  const nwShoppingList = nextWeekData?.shoppingList ?? []
  const nwCoverageDays = computeNextWeekCoverage(shoppingDays)
  const nwAvailableDays = nwCoverageDays.filter(d => nwPlan.some(e => e.tag === d))
  const nwListableDays = WOCHENTAGE.filter(d => nwPlan.some(e => e.tag === d) && !nwCoverageDays.includes(d))

  const effectiveWeekStart = weekStart ?? getMondayIso()
  const effectiveNwStart = nextWeekStart ?? getNextMondayIso()

  function itemIso(item: ShoppingItem): string | null {
    if (!item.tag) return null
    return getTagIsoDate(item.tag, item.nextWeek ? effectiveNwStart : effectiveWeekStart)
  }

  // Build unified day bar: current week days from today + NW days (coverage items + confirmed plan)
  const allBarDays: BarDay[] = (() => {
    const todayVal = todayIso()
    const map = new Map<string, BarDay>()

    for (let i = 0; i < 7; i++) {
      const tag = WOCHENTAGE[i]
      const iso = getTagIsoDate(tag, effectiveWeekStart)
      if (iso < todayVal) continue
      if (!weekPlan.some(e => e.tag === tag)) continue
      const d = new Date(iso + 'T00:00:00')
      map.set(iso, { isoDate: iso, tag, label: `${tag.slice(0, 2)} ${d.getDate()}.`, isNw: false })
    }

    // Coverage items from shoppingList with nextWeek:true → show as NW days in bar
    for (const item of shoppingList) {
      if (!item.nextWeek || !item.tag) continue
      const iso = getTagIsoDate(item.tag, effectiveNwStart)
      if (!iso || map.has(iso)) continue
      const d = new Date(iso + 'T00:00:00')
      map.set(iso, { isoDate: iso, tag: item.tag, label: `${item.tag.slice(0, 2)} ${d.getDate()}.`, isNw: true })
    }

    // NW plan days when confirmed
    if (nwConfirmed && nwPlan.length > 0) {
      for (let i = 0; i < 7; i++) {
        const tag = WOCHENTAGE[i]
        const iso = getTagIsoDate(tag, effectiveNwStart)
        if (!nwPlan.some(e => e.tag === tag) || map.has(iso)) continue
        const d = new Date(iso + 'T00:00:00')
        map.set(iso, { isoDate: iso, tag, label: `${tag.slice(0, 2)} ${d.getDate()}.`, isNw: true })
      }
    }

    return [...map.values()].sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  })()

  // NW item ID set for mutation routing
  const nwIdSet = new Set(nwShoppingList.map(i => i.id))

  function persistSelectedDates(next: Set<string>) {
    setSelectedDates(next)
    try { localStorage.setItem(SEL_KEY, JSON.stringify([...next])) } catch {}
  }

  // Init selection once bar days are available; run again when bar length grows
  useEffect(() => {
    if (allBarDays.length === 0) return
    if (selInitRef.current) return
    selInitRef.current = true
    const todayVal = todayIso()
    let stored: string | null = null
    try { stored = localStorage.getItem(SEL_KEY) } catch {}
    if (stored) {
      try {
        const parsed: string[] = JSON.parse(stored)
        const barSet = new Set(allBarDays.map(d => d.isoDate))
        const valid = parsed.filter(d => d >= todayVal && barSet.has(d))
        if (valid.length > 0) {
          setSelectedDates(new Set(valid))
          return
        }
      } catch {}
    }
    setSelectedDates(computeAutoSelection(allBarDays, shoppingDays))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBarDays.length])

  // Auto-load missing recipes for current week
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

  // Remove past-meal items on mount; never remove nextWeek items (bugfix)
  useEffect(() => {
    const todayIdx = WOCHENTAGE.indexOf(todayGerman())
    const cleaned = shoppingList.filter(i =>
      !i.gericht || !i.tag || i.nextWeek || WOCHENTAGE.indexOf(i.tag) >= todayIdx,
    )
    if (cleaned.length < shoppingList.length) onShoppingListChange(cleaned)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-generate NW shopping list when confirmed and empty
  useEffect(() => {
    if (!nwConfirmed) { nwAutoLoadRef.current = false; return }
    if (nwPlan.length === 0 || !onNextWeekDataChange) return
    if (nwShoppingList.length > 0 || nwAutoLoadRef.current) return
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

  // All NW days for the "🔄 Neu" picker (coverage + own list)
  const allNwPickerDays = [
    ...nwAvailableDays.map(d => ({ tag: d, isCoverage: true })),
    ...nwListableDays.map(d => ({ tag: d, isCoverage: false })),
  ]
  const plannedDays = WOCHENTAGE.filter(t => weekPlan.some(e => e.tag === t))

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

  function toggleNwPickerDay(day: string) {
    const s = new Set(selectedNwPickerDays)
    s.has(day) ? s.delete(day) : s.add(day)
    setSelectedNwPickerDays(s)
  }

  function openDayPicker() {
    setSelectedDays(new Set(['alle']))
    setSelectedNwPickerDays(nwConfirmed ? new Set(allNwPickerDays.map(d => d.tag)) : new Set())
    setDayPickerOpen(true)
  }

  async function confirmGenerate() {
    const cwDays = selectedDays.has('alle') ? undefined : [...selectedDays]
    const nwCoverageSet = new Set(nwAvailableDays)
    const selectedCovDays = [...selectedNwPickerDays].filter(d => nwCoverageSet.has(d))
    const selectedNwOwnDays = [...selectedNwPickerDays].filter(d => !nwCoverageSet.has(d))

    setGenerating(true)
    try {
      const freezerStr = getFreezerListString(freezerItems)
      const pantryStr = getPantryListString(pantryItems)
      const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)

      const thisWeekEntries = cwDays ? weekPlan.filter(e => cwDays.includes(e.tag)) : weekPlan
      const covEntries = nwPlan.filter(e => selectedCovDays.includes(e.tag))

      const thisWeekMeals = { ...mealsData }
      const nwMealsStore = { ...nwMeals }

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
      if (selectedCovDays.length > 0) await loadInto(covEntries, nwMealsStore)
      await onMealsDataChange(thisWeekMeals)

      onShoppingListChange(generateShoppingList(
        weekPlan, thisWeekMeals, cwDays,
        selectedCovDays.length > 0 ? nwPlan : undefined,
        selectedCovDays.length > 0 ? nwMealsStore : undefined,
        selectedCovDays.length > 0 ? selectedCovDays : undefined,
      ))

      if (selectedNwOwnDays.length > 0) {
        const nwOwnEntries = nwPlan.filter(e => selectedNwOwnDays.includes(e.tag))
        await loadInto(nwOwnEntries, nwMealsStore)
        const nwList = generateShoppingList(nwPlan, nwMealsStore, selectedNwOwnDays)
        await onNextWeekDataChange?.({ shoppingList: nwList, mealsData: nwMealsStore }, nextWeekStart ?? getNextMondayIso())
      }

      setDayPickerOpen(false)
    } finally {
      setGenerating(false)
    }
  }

  // Combined list (current + NW), marking NW items so itemIso routes correctly
  const combinedItems: ShoppingItem[] = [
    ...shoppingList,
    ...nwShoppingList.map(i => ({ ...i, nextWeek: true as const })),
  ]

  const filteredItems = combinedItems.filter(item => {
    if (!item.gericht || !item.tag || item.fromLastWeek) return true
    const iso = itemIso(item)
    return iso !== null && selectedDates.has(iso)
  })

  const fromLastWeekItems = shoppingList.filter(i => i.fromLastWeek)
  const recipeItems = filteredItems.filter(i => i.gericht)
  const manualItems = filteredItems.filter(i => !i.gericht && !i.fromLastWeek)
  const hasNwItems = recipeItems.some(i => i.nextWeek)
  const groups = groupShoppingByMeal(recipeItems, weekPlan, hasNwItems ? nwPlan : undefined)
  const consolidated = consolidateShoppingList(recipeItems)
  const doneCount = filteredItems.filter(i => i.erledigt).length
  const dayCount = new Set(recipeItems.map(i => itemIso(i)).filter(Boolean)).size
  const gerichtCount = new Set(recipeItems.map(i => i.gericht)).size
  const hasAnyItems = shoppingList.length > 0 || nwShoppingList.length > 0

  // Combined mutations — route by ID to correct list
  function nwUpdate(updated: ShoppingItem[]) {
    void onNextWeekDataChange?.({ shoppingList: updated }, nextWeekStart ?? getNextMondayIso())
  }
  function combinedToggle(id: string) {
    if (nwIdSet.has(id)) nwUpdate(toggleShoppingItem(nwShoppingList, id))
    else onShoppingListChange(toggleShoppingItem(shoppingList, id))
  }
  function combinedRemove(id: string) {
    if (nwIdSet.has(id)) nwUpdate(removeShoppingItem(nwShoppingList, id))
    else onShoppingListChange(removeShoppingItem(shoppingList, id))
  }
  function combinedToggleConsolidated(ids: string[]) {
    const allItems = [...shoppingList, ...nwShoppingList]
    const allDone = ids.every(id => allItems.find(i => i.id === id)?.erledigt)
    const newState = !allDone
    const nwArr = ids.filter(id => nwIdSet.has(id))
    const cwArr = ids.filter(id => !nwIdSet.has(id))
    const cwSet = new Set(cwArr)
    const nwSet = new Set(nwArr)
    if (cwArr.length > 0) onShoppingListChange(shoppingList.map(i => cwSet.has(i.id) ? { ...i, erledigt: newState } : i))
    if (nwArr.length > 0) nwUpdate(nwShoppingList.map(i => nwSet.has(i.id) ? { ...i, erledigt: newState } : i))
  }

  function addManual() {
    if (!newName.trim()) return
    onShoppingListChange(addShoppingItem(shoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>🛒 Einkauf</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasAnyItems && (
            <button
              onClick={openDayPicker}
              style={{ border: 'none', background: 'none', color: '#1D9E75', fontSize: 12, cursor: 'pointer' }}
            >
              🔄 Neu
            </button>
          )}
          {doneCount > 0 && (
            <button
              onClick={() => {
                onShoppingListChange(clearCompleted(shoppingList))
                if (nwShoppingList.some(i => i.erledigt)) nwUpdate(clearCompleted(nwShoppingList))
              }}
              style={{ border: 'none', background: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer' }}
            >
              Erledigtes löschen
            </button>
          )}
        </div>
      </div>
      <div className="content">

        {/* Unified day bar */}
        {allBarDays.length > 0 && (
          <div style={{ overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
            <div style={{ display: 'flex', gap: 6, minWidth: 'max-content' }}>
              {allBarDays.map(bd => {
                const sel = selectedDates.has(bd.isoDate)
                return (
                  <button
                    key={bd.isoDate}
                    onClick={() => {
                      const next = new Set(selectedDates)
                      sel ? next.delete(bd.isoDate) : next.add(bd.isoDate)
                      persistSelectedDates(next)
                    }}
                    style={{
                      padding: '5px 11px',
                      border: `1.5px solid ${sel ? '#1D9E75' : '#ddd'}`,
                      borderRadius: 20,
                      background: sel ? '#1D9E75' : 'white',
                      color: sel ? 'white' : bd.isNw ? '#1D6E9E' : '#444',
                      fontSize: 12,
                      fontWeight: sel ? 700 : 400,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {bd.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* NW coverage warning when plan not yet confirmed */}
        {nwCoverageDays.length > 0 && !nwConfirmed && (
          <div style={{ background: '#FFF3CD', border: '1px solid #FFC107', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#856404', marginBottom: 2 }}>
              ⚠️ Nächste Woche noch nicht freigegeben
            </div>
            <div style={{ fontSize: 11, color: '#664d00' }}>
              {shoppingDays.length > 0 ? `${shoppingDays[shoppingDays.length - 1]}s` : 'Der'} Einkauf deckt auch <strong>{nwCoverageDays.join(', ')}</strong> der nächsten Woche ab – aber der Plan ist noch nicht freigegeben.
            </div>
          </div>
        )}

        {/* 🔄 Neu day picker */}
        {dayPickerOpen && (
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
            {(allNwPickerDays.length > 0 || (nwCoverageDays.length > 0 && !nwConfirmed)) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 500 }}>
                  Nächste Woche miteinschließen:
                </div>
                {nwConfirmed && allNwPickerDays.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allNwPickerDays.map(d => (
                      <button
                        key={d.tag}
                        className={`menu-tab${selectedNwPickerDays.has(d.tag) ? ' on' : ''}`}
                        onClick={() => toggleNwPickerDay(d.tag)}
                      >
                        {d.tag.slice(0, 2)} ⁺¹
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

        {/* Missing recipes warning */}
        {(() => {
          const allMissing = [
            ...weekPlan.filter(e => !isFullRecipe(mealsData[e.gericht]) && shoppingList.some(i => i.gericht === e.gericht)),
            ...nwPlan.filter(e => !isFullRecipe(nwMeals[e.gericht]) && nwShoppingList.some(i => i.gericht === e.gericht)),
          ]
          if (allMissing.length === 0) return null
          return (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>
                ⚠️ Fehlende Rezepte ({allMissing.length})
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                Für diese Gerichte fehlen Zutaten in der Einkaufsliste:
              </div>
              {allMissing.map(e => (
                <div key={`${e.tag}-${e.slot}`} style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>
                  {e.emoji} {e.gericht} · {e.tag} {e.slot === 'Mittag' ? '🌞' : '🌙'}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Empty state */}
        {!hasAnyItems && !dayPickerOpen && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>
              {weekPlan.length === 0
                ? 'Zuerst den Wochenplan erstellen.'
                : 'Einkaufsliste aus dem Wochenplan generieren?'}
            </div>
            {weekPlan.length > 0 && (
              <button
                className="btn primary"
                style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }}
                onClick={openDayPicker}
              >
                📋 Liste generieren
              </button>
            )}
          </div>
        )}

        {/* "Noch offen aus letzter Woche" box */}
        {fromLastWeekItems.length > 0 && (
          <div style={{ background: '#FFF9F0', border: '1px solid #FFD8A0', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8B4E00', marginBottom: 4 }}>⏳ Noch offen aus letzter Woche</div>
            {fromLastWeekItems.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => onShoppingListChange(toggleShoppingItem(shoppingList, item.id))}
                onRemove={() => onShoppingListChange(removeShoppingItem(shoppingList, item.id))}
              />
            ))}
          </div>
        )}

        {hasAnyItems && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              {recipeItems.length > 0 && (
                <span style={{ fontSize: 11, color: '#aaa', flex: 1 }}>
                  {dayCount} {dayCount === 1 ? 'Tag' : 'Tage'} · {gerichtCount} {gerichtCount === 1 ? 'Gericht' : 'Gerichte'} · {doneCount}/{filteredItems.length} erledigt
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
                      <ItemRow key={item.id} item={item} onToggle={() => combinedToggle(item.id)} onRemove={() => combinedRemove(item.id)} />
                    ))}
                  </div>
                ))}
              </>
            )}

            {viewMode === 'zusammen' && (
              <>
                {consolidated.map(item => (
                  <ConsolidatedRow key={item.name} item={item} onToggle={() => combinedToggleConsolidated(item.ids)} />
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
                        <ConsolidatedRow item={item} onToggle={() => combinedToggleConsolidated(item.ids)} />
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
                            <ItemRow item={mi} onToggle={() => combinedToggle(mi.id)} onRemove={() => combinedRemove(mi.id)} />
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
                          <ItemRow item={item} onToggle={() => combinedToggle(item.id)} onRemove={() => combinedRemove(item.id)} />
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
                  <ItemRow key={item.id} item={item} onToggle={() => combinedToggle(item.id)} onRemove={() => combinedRemove(item.id)} />
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
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="Artikel"
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
            />
            <input
              value={newMenge}
              onChange={e => setNewMenge(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="Menge"
              style={{ width: 76, border: '1px solid #ddd', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={addManual}
              style={{ border: 'none', background: '#1D9E75', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >+</button>
          </div>
        </div>

        {currentUser === wochenchef && !shopDone && shoppingList.length > 0 && (
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

        {shopDone && (
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
