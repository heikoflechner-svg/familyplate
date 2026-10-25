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
  isWaterIngredient,
  normalizeName,
  WARENGRUPPEN,
  NO_MERGE,
  parseMengeStück,
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
  zutatenWarengruppe?: Record<string, string>
  zutatenAliase?: Record<string, string>
  onZutatenWarengruppeChange?: (mapping: Record<string, string>) => Promise<void>
  onZutatenAliasChange?: (aliase: Record<string, string>) => Promise<void>
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
  onZutatenLadenChange, zutatenWarengruppe, zutatenAliase,
  onZutatenWarengruppeChange, onZutatenAliasChange,
  canEditSettings, planConfirmed = false, attendance = [],
  shoppingDays = [], nextWeekData = null, freezerItems, pantryItems, members,
  onNextWeekDataChange, weekStart = null, nextWeekStart = null,
}: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')
  const [generating, setGenerating] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('tag')
  const [editingItem, setEditingItem] = useState<string | null>(null)
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

  // Build unified day bar for selection logic
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

    for (const item of shoppingList) {
      if (!item.nextWeek || !item.tag) continue
      const iso = getTagIsoDate(item.tag, effectiveNwStart)
      if (!iso || map.has(iso)) continue
      const d = new Date(iso + 'T00:00:00')
      map.set(iso, { isoDate: iso, tag: item.tag, label: `${item.tag.slice(0, 2)} ${d.getDate()}.`, isNw: true })
    }

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

  const nwIdSet = new Set(nwShoppingList.map(i => i.id))

  function persistSelectedDates(next: Set<string>) {
    setSelectedDates(next)
    try { localStorage.setItem(SEL_KEY, JSON.stringify([...next])) } catch {}
  }

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
        if (valid.length > 0) { setSelectedDates(new Set(valid)); return }
      } catch {}
    }
    setSelectedDates(computeAutoSelection(allBarDays, shoppingDays))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBarDays.length])

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

  // One-time cleanup on mount: remove past meals, water items, and cross-list NW duplicates
  useEffect(() => {
    const todayIdx = WOCHENTAGE.indexOf(todayGerman())
    const nwList = nextWeekData?.shoppingList ?? []

    // Build set of gericht+tag keys present in nwList
    const nwDishKeys = new Set(nwList.filter(i => i.gericht).map(i => `${i.gericht}|${i.tag ?? ''}`))

    const cleaned = shoppingList.filter(i => {
      if (!i.gericht || !i.tag) return true
      if (isWaterIngredient(i.name)) return false
      // Remove past non-NW meals
      if (!i.nextWeek && WOCHENTAGE.indexOf(i.tag) < todayIdx) return false
      // Remove nextWeek:true items that now have entries in nextWeekData.shoppingList (duplicates from old bug)
      if (i.nextWeek && nwDishKeys.has(`${i.gericht}|${i.tag}`)) return false
      return true
    })
    if (cleaned.length < shoppingList.length) onShoppingListChange(cleaned)

    // Clean NW list: remove water items + deduplicate (keep last occurrence per gericht+tag+name)
    if (nwList.length > 0 && onNextWeekDataChange) {
      const nwNoWater = nwList.filter(i => !isWaterIngredient(i.name))
      const seen = new Set<string>()
      const dedupedNw: ShoppingItem[] = []
      for (let j = nwNoWater.length - 1; j >= 0; j--) {
        const item = nwNoWater[j]
        if (!item.gericht) { dedupedNw.unshift(item); continue }
        const key = `${item.gericht}|${item.tag ?? ''}|${item.name.toLowerCase()}`
        if (!seen.has(key)) { seen.add(key); dedupedNw.unshift(item) }
      }
      if (dedupedNw.length < nwList.length) {
        void onNextWeekDataChange({ shoppingList: dedupedNw }, nextWeekStart ?? getNextMondayIso())
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Regenerate list for currently selected days (no picker needed)
  async function regenerateNow() {
    if (generating) return
    setGenerating(true)
    try {
      const nwCoverageSet = new Set(nwAvailableDays)

      const cwTags = allBarDays.filter(bd => !bd.isNw && selectedDates.has(bd.isoDate)).map(bd => bd.tag)
      const nwCovTags = allBarDays.filter(bd => bd.isNw && selectedDates.has(bd.isoDate) && nwCoverageSet.has(bd.tag)).map(bd => bd.tag)
      const nwOwnTags = allBarDays.filter(bd => bd.isNw && selectedDates.has(bd.isoDate) && !nwCoverageSet.has(bd.tag)).map(bd => bd.tag)

      const hasCw = cwTags.length > 0
      const hasNwCov = nwCovTags.length > 0
      const hasNwOwn = nwOwnTags.length > 0
      const hasAny = hasCw || hasNwCov || hasNwOwn

      // Nothing selected → regenerate all current-week planned days
      const effectiveCwTags = hasAny && !hasCw && !hasNwCov ? null : (hasCw ? cwTags : undefined)
      // null = skip CW regeneration (only NW own selected)

      const freezerStr = getFreezerListString(freezerItems)
      const pantryStr = getPantryListString(pantryItems)
      const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)

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
          if (r) store[e.gericht] = { ...r, ersetzteZutaten: r.ersetzteZutaten?.length ? r.ersetzteZutaten : (store[e.gericht]?.ersetzteZutaten ?? []) }
        }))
      }

      if (effectiveCwTags !== null) {
        const cwEntries = effectiveCwTags ? weekPlan.filter(e => effectiveCwTags.includes(e.tag)) : weekPlan
        const covEntries = nwPlan.filter(e => nwCovTags.includes(e.tag))
        await loadInto(cwEntries, thisWeekMeals)
        if (hasNwCov) await loadInto(covEntries, nwMealsStore)
        await onMealsDataChange(thisWeekMeals)
        onShoppingListChange(generateShoppingList(
          weekPlan, thisWeekMeals, effectiveCwTags ?? undefined,
          hasNwCov ? nwPlan : undefined,
          hasNwCov ? nwMealsStore : undefined,
          hasNwCov ? nwCovTags : undefined,
        ))
      }

      if (hasNwOwn) {
        await loadInto(nwPlan.filter(e => nwOwnTags.includes(e.tag)), nwMealsStore)
        const nwList = generateShoppingList(nwPlan, nwMealsStore, nwOwnTags)
        await onNextWeekDataChange?.({ shoppingList: nwList, mealsData: nwMealsStore }, nextWeekStart ?? getNextMondayIso())
      }
    } finally {
      setGenerating(false)
    }
  }

  // Combined list
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
  const consolidated = consolidateShoppingList(recipeItems, zutatenWarengruppe, zutatenAliase)
  const doneCount = filteredItems.filter(i => i.erledigt).length
  const dayCount = new Set(recipeItems.map(i => itemIso(i)).filter(Boolean)).size
  const gerichtCount = new Set(recipeItems.map(i => i.gericht)).size
  const hasAnyItems = shoppingList.length > 0 || nwShoppingList.length > 0

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

  // Day bar helpers
  const todayVal = todayIso()
  function cwDayInfo(tag: string) {
    const iso = getTagIsoDate(tag, effectiveWeekStart)
    const hasMeal = weekPlan.some(e => e.tag === tag)
    const isPast = iso < todayVal
    const disabled = isPast || !hasMeal
    const selected = selectedDates.has(iso)
    const dayNum = new Date(iso + 'T00:00:00').getDate()
    return { iso, disabled, selected, dayNum }
  }
  function nwDayInfo(tag: string) {
    const iso = getTagIsoDate(tag, effectiveNwStart)
    const hasMeal = nwPlan.some(e => e.tag === tag) ||
      shoppingList.some(i => i.nextWeek && i.tag === tag)
    const disabled = !hasMeal
    const selected = selectedDates.has(iso)
    const dayNum = new Date(iso + 'T00:00:00').getDate()
    return { iso, disabled, selected, dayNum }
  }

  const showNwRow = nwConfirmed && nwPlan.length > 0

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>🛒 Einkauf</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {weekPlan.length > 0 && (
            <button
              onClick={regenerateNow}
              disabled={generating}
              style={{ border: 'none', background: 'none', color: generating ? '#aaa' : '#1D9E75', fontSize: 12, cursor: generating ? 'default' : 'pointer' }}
            >
              {generating ? '⏳ …' : '🔄 Neu'}
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

        {/* 2-row day grid */}
        {(weekPlan.length > 0 || showNwRow) && (
          <div style={{ marginBottom: 14 }}>
            {weekPlan.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Diese Woche{weekStart ? ` · KW ${getKW(weekStart)}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                  {WOCHENTAGE.map(tag => {
                    const { iso, disabled, selected, dayNum } = cwDayInfo(tag)
                    return (
                      <button
                        key={tag}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          const next = new Set(selectedDates)
                          selected ? next.delete(iso) : next.add(iso)
                          persistSelectedDates(next)
                        }}
                        style={{
                          padding: '5px 2px',
                          border: `1.5px solid ${selected ? '#1D9E75' : disabled ? '#ececec' : '#ddd'}`,
                          borderRadius: 8,
                          background: selected ? '#1D9E75' : disabled ? '#f7f7f7' : 'white',
                          color: selected ? 'white' : disabled ? '#ccc' : '#333',
                          cursor: disabled ? 'default' : 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: selected ? 700 : 400, lineHeight: 1.2 }}>{tag.slice(0, 2)}</div>
                        <div style={{ fontSize: 9, color: selected ? 'rgba(255,255,255,0.8)' : '#aaa', lineHeight: 1.2, marginTop: 1 }}>{dayNum}.</div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {showNwRow && (
              <>
                <div style={{ fontSize: 10, color: '#1D6E9E', fontWeight: 600, marginTop: 10, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Nächste Woche{nextWeekStart ? ` · KW ${getKW(nextWeekStart)}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                  {WOCHENTAGE.map(tag => {
                    const { iso, disabled, selected, dayNum } = nwDayInfo(tag)
                    return (
                      <button
                        key={tag}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          const next = new Set(selectedDates)
                          selected ? next.delete(iso) : next.add(iso)
                          persistSelectedDates(next)
                        }}
                        style={{
                          padding: '5px 2px',
                          border: `1.5px solid ${selected ? '#1D6E9E' : disabled ? '#ececec' : '#c5def5'}`,
                          borderRadius: 8,
                          background: selected ? '#1D6E9E' : disabled ? '#f7f7f7' : '#f0f7ff',
                          color: selected ? 'white' : disabled ? '#ccc' : '#1D6E9E',
                          cursor: disabled ? 'default' : 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: selected ? 700 : 400, lineHeight: 1.2 }}>{tag.slice(0, 2)}</div>
                        <div style={{ fontSize: 9, color: selected ? 'rgba(255,255,255,0.8)' : '#90b8d4', lineHeight: 1.2, marginTop: 1 }}>{dayNum}.</div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* NW coverage warning */}
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
        {!hasAnyItems && (
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
                onClick={regenerateNow}
                disabled={generating}
              >
                {generating ? '🐀 Rémy holt Rezepte…' : '📋 Liste generieren'}
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
                  <div key={item.name}>
                    <ConsolidatedRow
                      item={item}
                      onToggle={() => combinedToggleConsolidated(item.ids)}
                      onEdit={() => setEditingItem(editingItem === item.name ? null : item.name)}
                      editing={editingItem === item.name}
                    />
                    {editingItem === item.name && (
                      <WarengruppePanel
                        item={item}
                        zutatenWarengruppe={zutatenWarengruppe}
                        zutatenAliase={zutatenAliase}
                        onWarengruppeChange={onZutatenWarengruppeChange}
                        onAliasChange={onZutatenAliasChange}
                        onClose={() => setEditingItem(null)}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {viewMode === 'laden' && (
              <>
                {groupByLaden(recipeItems, zutatenLaden, laeden, zutatenWarengruppe, zutatenAliase).map(group => (
                  <div key={group.laden} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, paddingBottom: 4, borderBottom: '1.5px solid #eee' }}>
                      {group.unassigned ? 'Noch keinem Laden zugeordnet' : group.laden}
                    </div>
                    {group.sections.map(section => (
                      <div key={section.warengruppe}>
                        {group.sections.length > 1 && (
                          <div style={{ fontSize: 10, color: '#bbb', fontWeight: 600, marginTop: 8, marginBottom: 2, paddingLeft: 2 }}>
                            {section.warengruppe}
                          </div>
                        )}
                        {section.items.map(item => (
                          <div key={item.name}>
                            <ConsolidatedRow
                              item={item}
                              onToggle={() => combinedToggleConsolidated(item.ids)}
                              onEdit={() => setEditingItem(editingItem === item.name ? null : item.name)}
                              editing={editingItem === item.name}
                            />
                            {editingItem === item.name && (
                              <WarengruppePanel
                                item={item}
                                zutatenWarengruppe={zutatenWarengruppe}
                                zutatenAliase={zutatenAliase}
                                onWarengruppeChange={onZutatenWarengruppeChange}
                                onAliasChange={onZutatenAliasChange}
                                onClose={() => setEditingItem(null)}
                              />
                            )}
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
                                      // also remove legacy keys from variants
                                      item.variants?.forEach(v => { delete next[v.name.toLowerCase()] })
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
  const isFuer = !!item.fuer
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isFuer ? '#856404' : isErsatz ? '#2563EB' : '#111'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <Checkbox checked={item.erledigt} onToggle={onToggle} />
      <div style={{ flex: 1, textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
        {item.name}
        {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
        {isFuer && !item.erledigt && (
          <span style={{ fontSize: 10, background: '#FFF3CD', color: '#856404', borderRadius: 4, padding: '1px 5px', marginLeft: 6, whiteSpace: 'nowrap' }}>
            ⚠️ für {item.fuer}
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
      >×</button>
    </div>
  )
}

const COLOR_QUALIFIERS: Record<string, string> = {
  rot: 'rot', rote: 'rot', roter: 'rot', rotes: 'rot', roten: 'rot',
  grün: 'grün', grüne: 'grün', grüner: 'grün', grünes: 'grün', grünen: 'grün',
  gelb: 'gelb', gelbe: 'gelb', gelber: 'gelb', gelbes: 'gelb', gelben: 'gelb',
  orange: 'orange', orangene: 'orange', orangenen: 'orange',
  lila: 'lila',
  braun: 'braun', braune: 'braun', brauner: 'braun',
  weiß: 'weiß', weiße: 'weiß', weißer: 'weiß',
  bunt: 'bunt', bunte: 'bunt', bunter: 'bunt',
}

function extractQualifier(variantName: string, canonicalName: string): string {
  const vn = variantName.toLowerCase().trim()
  const cn = canonicalName.toLowerCase().trim()
  let qual = vn.replace(cn, '').replace(/[(),]/g, '').trim()
  if (!qual) qual = vn.replace(normalizeName(cn), '').replace(/[(),]/g, '').trim()
  if (!qual) return 'beliebig'
  if (/\boder\b|\bund\b|gemischt|verschiedene?|beliebig/.test(qual)) return 'beliebig'
  if (qual.includes(',') || qual.includes('/')) return 'beliebig'
  const words = qual.split(/\s+/)
  if (words.length === 1) return COLOR_QUALIFIERS[words[0]] ?? 'beliebig'
  if (words.every(w => COLOR_QUALIFIERS[w])) return 'beliebig'
  return 'beliebig'
}

function buildVariantBracket(variants: ConsolidatedItem['variants'], canonicalName: string): string | null {
  if (!variants || variants.length <= 1) return null
  const grouped = new Map<string, number>()
  for (const v of variants) {
    const label = extractQualifier(v.name, canonicalName)
    const count = parseMengeStück(v.menge)
    grouped.set(label, (grouped.get(label) ?? 0) + count)
  }
  if (![...grouped.keys()].some(k => k !== 'beliebig')) return null
  const parts = [...grouped.entries()].map(([label, count]) =>
    `${label} ${Number.isInteger(count) ? count : count.toFixed(1)}`
  )
  return `(${parts.join(', ')})`
}

function ConsolidatedRow({ item, onToggle, onEdit, editing }: {
  item: ConsolidatedItem
  onToggle: () => void
  onEdit?: () => void
  editing?: boolean
}) {
  const [showDetails, setShowDetails] = useState(false)
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isErsatz ? '#2563EB' : '#111'
  const hasSources = item.sources.length > 0
  const hasVariants = (item.variants?.length ?? 0) > 1
  const variantBracket = hasVariants ? buildVariantBracket(item.variants, item.name) : null
  const hasDetails = hasSources || hasVariants

  return (
    <div style={{ borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0 9px 12px' }}>
        <Checkbox checked={item.erledigt} onToggle={onToggle} />
        <div style={{ flex: 1 }}>
          <div style={{ textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
            {item.name}
            {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
            {variantBracket && <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{variantBracket}</span>}
          </div>
          {hasDetails && (
            <button
              onClick={() => setShowDetails(s => !s)}
              style={{ fontSize: 10, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', marginTop: 1 }}
            >
              {showDetails ? '▾ Details' : '▸ Details'}
            </button>
          )}
          {showDetails && (
            <>
              {hasVariants && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                  {item.variants!.map((v, i) => (
                    <span key={i} style={{ fontSize: 10, color: '#aaa', background: '#f5f5f5', borderRadius: 8, padding: '1px 6px' }}>
                      {v.name}{v.menge ? ` · ${v.menge}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {hasSources && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                  {item.sources.map((s, i) => (
                    <span key={i} style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                      {s.tag.slice(0, 2)} {s.slot === 'Mittag' ? '🌞' : '🌙'} · {s.gericht}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              border: 'none', background: 'none', fontSize: 14, cursor: 'pointer', lineHeight: 1,
              color: editing ? '#1D9E75' : '#ccc', padding: '0 8px 0 0', flexShrink: 0,
            }}
          >⋯</button>
        )}
      </div>
    </div>
  )
}

function WarengruppePanel({ item, zutatenWarengruppe, zutatenAliase, onWarengruppeChange, onAliasChange, onClose }: {
  item: ConsolidatedItem
  zutatenWarengruppe?: Record<string, string>
  zutatenAliase?: Record<string, string>
  onWarengruppeChange?: (m: Record<string, string>) => Promise<void>
  onAliasChange?: (a: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const normKey = normalizeName(item.name)
  const currentWg = zutatenWarengruppe?.[normKey] ?? item.warengruppe
  const isCurrentlyNoMerge = (zutatenAliase ?? {})[normKey] === NO_MERGE
  const hasVariants = (item.variants?.length ?? 0) > 1

  return (
    <div style={{ paddingLeft: 32, paddingRight: 8, paddingBottom: 12, paddingTop: 4, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 5, fontWeight: 600 }}>Warengruppe</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {WARENGRUPPEN.map(wg => (
          <button
            key={wg}
            onClick={() => {
              const newMap = { ...(zutatenWarengruppe ?? {}), [normKey]: wg }
              onWarengruppeChange?.(newMap)
              onClose()
            }}
            style={{
              fontSize: 10, padding: '3px 8px',
              border: `1px solid ${wg === currentWg ? '#1D9E75' : '#ddd'}`,
              borderRadius: 12, cursor: 'pointer',
              background: wg === currentWg ? '#e8f9f3' : '#f5f5f5',
              color: wg === currentWg ? '#1D9E75' : '#555',
              fontWeight: wg === currentWg ? 700 : 400,
            }}
          >{wg}</button>
        ))}
      </div>
      {(hasVariants || isCurrentlyNoMerge) && (
        <div style={{ marginTop: 8 }}>
          {isCurrentlyNoMerge ? (
            <button
              onClick={() => {
                const aliase = { ...(zutatenAliase ?? {}) }
                delete aliase[normKey]
                onAliasChange?.(aliase)
                onClose()
              }}
              style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #1D9E75', borderRadius: 12, background: '#e8f9f3', cursor: 'pointer', color: '#1D9E75' }}
            >
              Zusammenfassen
            </button>
          ) : hasVariants ? (
            <button
              onClick={() => {
                const aliase = { ...(zutatenAliase ?? {}), [normKey]: NO_MERGE }
                onAliasChange?.(aliase)
                onClose()
              }}
              style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 12, background: '#fff3cd', cursor: 'pointer', color: '#92400E' }}
            >
              Nicht zusammenfassen
            </button>
          ) : null}
        </div>
      )}
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
