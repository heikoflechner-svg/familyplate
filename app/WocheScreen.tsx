'use client'
import { useState, useEffect } from 'react'
import { generateWeekPlan, getRemySuggestions, generateRecipe, saveLastDishes } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString, addFreezerItem, deleteFreezerItem } from '../lib/freezerLogic'
import { buildFamilyPrompt, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, Wish, Chef, WochenSlot, FamilyMember, DayAttendance, ChangeProposal, ShoppingItem, RemyVorschlag, NextWeekData, NextWeekWish } from '../lib/state'
import SlotWunschPanel from './SlotWunschPanel'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function getMondayIso(d: Date = new Date()): string {
  const date = new Date(d)
  const dow = date.getDay()
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow))
  return date.toISOString().slice(0, 10)
}
function getNextMondayIso(d: Date = new Date()): string {
  const date = new Date(d)
  const dow = date.getDay()
  date.setDate(date.getDate() + (dow === 0 ? 1 : 8 - dow))
  return date.toISOString().slice(0, 10)
}
function getKW(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const yearStart = new Date(thu.getFullYear(), 0, 4)
  return Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
function getWeekRange(mondayIso: string): string {
  const mon = new Date(mondayIso + 'T00:00:00')
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const M = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
  return `${mon.getDate()}.–${sun.getDate()}. ${M[sun.getMonth()]}`
}

const CFG: Record<string, { bg: string; c: string }> = {
  MA: { bg: '#E1F5EE', c: '#0F6E56' },
  PA: { bg: '#E6F1FB', c: '#0C447C' },
  TI: { bg: '#FBEAF0', c: '#72243E' },
}

function todayGerman(): string {
  return WOCHENTAGE[(new Date().getDay() + 6) % 7]
}

function getSlot(weekPlan: WeekPlanEntry[], tag: string, slot: 'Mittag' | 'Abend'): WeekPlanEntry | null {
  return weekPlan.find(e => e.tag === tag && e.slot === slot) ?? null
}

interface Props {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  planMittag: boolean
  planWE: boolean
  freezerItems: FreezerItem[]
  pantryItems: PantryItem[]
  wishes: Wish[]
  currentUser: Chef
  wochenchef: Chef
  members: FamilyMember[]
  attendance: DayAttendance[]
  attendanceConfirmed: Chef[]
  proposals: ChangeProposal[]
  planConfirmed: boolean
  shopDone: boolean
  onWeekPlanChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>) => Promise<void>
  onWeekPlanAndWishesChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>, wishes: Wish[]) => Promise<void>
  onWishesChange: (wishes: Wish[]) => Promise<void>
  onAttendanceChange: (a: DayAttendance[]) => Promise<void>
  onAttendanceConfirmedChange: (confirmed: Chef[]) => Promise<void>
  onPlanConfirm?: (entries: WeekPlanEntry[]) => Promise<void>
  onProposalsChange: (proposals: ChangeProposal[]) => Promise<void>
  onWochenchefChange: (chef: Chef) => Promise<void>
  onPlanConfirmedChange: (confirmed: boolean) => Promise<void>
  onShopDoneChange: (done: boolean) => Promise<void>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => Promise<void>
  onFreezerChange: (items: FreezerItem[]) => void
  attendanceSignal?: number
  shoppingDays?: string[]
  shoppingPersons?: Record<string, Chef>
  onShoppingPersonsChange?: (persons: Record<string, Chef>) => Promise<void>
  lastDishes?: string[]
  weekStart?: string | null
  nextWeekStart?: string | null
  nextWeekData?: NextWeekData | null
  onNextWeekDataChange?: (data: Partial<NextWeekData>, nextMonday: string) => Promise<void>
  onActivateNextWeek?: () => Promise<void>
}

type View = 'home' | 'week' | 'plan' | 'attendance'
type PlanState = 'options' | 'loading' | 'results'

// Frist-Logik: 1 Tag vor dem nächsten Einkaufstag, 20:00 Uhr.
// Gibt null zurück wenn kein Einkaufstag konfiguriert.
function getShoppingDeadlineStatus(shoppingDays: string[], now = new Date()):
  { passed: boolean; deadlineDayName: string; shoppingDayName: string } | null {
  const nameToNum: Record<string, number> = {
    Sonntag: 0, Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5, Samstag: 6,
  }
  const numToName = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  if (shoppingDays.length === 0) return null
  const todayNum = now.getDay()
  let earliestFuture: { deadline: Date; deadlineDayNum: number; shoppingDayName: string } | null = null
  let mostRecentPast: { deadline: Date; deadlineDayNum: number; shoppingDayName: string } | null = null
  for (const shoppingName of shoppingDays) {
    const shoppingNum = nameToNum[shoppingName]
    if (shoppingNum === undefined) continue
    if (shoppingNum < todayNum) continue  // diese Woche bereits vorbei
    const deadlineNum = (shoppingNum - 1 + 7) % 7
    if (shoppingNum === todayNum) {
      // Einkaufstag = heute → Frist war gestern 20:00 = vorbei
      const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0)
      if (!mostRecentPast || d > mostRecentPast.deadline)
        mostRecentPast = { deadline: d, deadlineDayNum: deadlineNum, shoppingDayName: shoppingName }
      continue
    }
    const daysUntil = deadlineNum - todayNum
    const deadline = new Date(now)
    deadline.setDate(deadline.getDate() + daysUntil)
    deadline.setHours(20, 0, 0, 0)
    if (now < deadline) {
      if (!earliestFuture || deadline < earliestFuture.deadline)
        earliestFuture = { deadline, deadlineDayNum: deadlineNum, shoppingDayName: shoppingName }
    } else {
      if (!mostRecentPast || deadline > mostRecentPast.deadline)
        mostRecentPast = { deadline, deadlineDayNum: deadlineNum, shoppingDayName: shoppingName }
    }
  }
  if (earliestFuture) return { passed: false, deadlineDayName: numToName[earliestFuture.deadlineDayNum], shoppingDayName: earliestFuture.shoppingDayName }
  if (mostRecentPast) return { passed: true, deadlineDayName: numToName[mostRecentPast.deadlineDayNum], shoppingDayName: mostRecentPast.shoppingDayName }
  return null
}

export default function WocheScreen({
  weekPlan, mealsData, planMittag, planWE, freezerItems, pantryItems,
  wishes, currentUser, wochenchef, members, attendance, attendanceConfirmed, proposals, planConfirmed, shopDone, onWeekPlanChange, onWeekPlanAndWishesChange, onWishesChange,
  onAttendanceChange, onAttendanceConfirmedChange, onPlanConfirm, onProposalsChange, onWochenchefChange, onPlanConfirmedChange, onShopDoneChange,
  shoppingList, onShoppingListChange, onFreezerChange, attendanceSignal,
  shoppingDays = [],
  shoppingPersons = {},
  onShoppingPersonsChange,
  lastDishes = [],
  weekStart = null,
  nextWeekStart = null,
  nextWeekData = null,
  onNextWeekDataChange,
  onActivateNextWeek,
}: Props) {
  const personNames: Record<Chef, string> = Object.fromEntries(
    (members.length ? members : DEFAULT_MEMBERS).map(m => [m.id, m.name])
  ) as Record<Chef, string>
  const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)
  const activeMembers = members.length ? members : DEFAULT_MEMBERS
  const suggestedNextChef: Chef = ([...activeMembers].sort((a, b) => {
    const aDate = a.chefStat?.lastCook ?? ''
    const bDate = b.chefStat?.lastCook ?? ''
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0
  }).find(m => m.id !== wochenchef)?.id ?? activeMembers.find(m => m.id !== wochenchef)?.id ?? 'PA') as Chef
  const wishDeadlineStatus = getShoppingDeadlineStatus(shoppingDays)
  const wishDeadlinePassed = planConfirmed && (wishDeadlineStatus?.passed ?? false)
  const wishDeadlineHint = wishDeadlinePassed && wishDeadlineStatus
    ? `Änderungen waren nur bis ${wishDeadlineStatus.deadlineDayName} 20:00 Uhr möglich – Einkauf ist am ${wishDeadlineStatus.shoppingDayName}`
    : undefined

  const [view, setView] = useState<View>('home')
  useEffect(() => { if (attendanceSignal && attendanceSignal > 0) setView('attendance') }, [attendanceSignal])
  const [planState, setPlanState] = useState<PlanState>('options')
  const [pendingPlan, setPendingPlan] = useState<WeekPlanEntry[]>([])
  const [pendingPlanMeals, setPendingPlanMeals] = useState<Record<string, Rezept>>({})
  const [pendingDayMeals, setPendingDayMeals] = useState<Record<string, Rezept>>({})

  // sessionStorage: Vorschlag bei Reload wiederherstellen
  useEffect(() => {
    try {
      const savedPlan = sessionStorage.getItem('fp_pendingPlan')
      const savedMeals = sessionStorage.getItem('fp_pendingPlanMeals')
      if (savedPlan && savedMeals) {
        const plan = JSON.parse(savedPlan) as WeekPlanEntry[]
        if (plan.length > 0) {
          setPendingPlan(plan)
          setPendingPlanMeals(JSON.parse(savedMeals) as Record<string, Rezept>)
          setPlanState('results')
          setView('plan')
        }
      }
    } catch {
      sessionStorage.removeItem('fp_pendingPlan')
      sessionStorage.removeItem('fp_pendingPlanMeals')
    }
  }, [])

  useEffect(() => {
    if (pendingPlan.length > 0) {
      sessionStorage.setItem('fp_pendingPlan', JSON.stringify(pendingPlan))
      sessionStorage.setItem('fp_pendingPlanMeals', JSON.stringify(pendingPlanMeals))
    } else {
      sessionStorage.removeItem('fp_pendingPlan')
      sessionStorage.removeItem('fp_pendingPlanMeals')
    }
  }, [pendingPlan, pendingPlanMeals])
  const [neuTage, setNeuTage] = useState<Set<string>>(new Set(['alle']))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedMealName, setSelectedMealName] = useState<string | null>(null)

  const [chefAltSelection, setChefAltSelection] = useState<Record<string, string>>({})
  const [chefErgaenzungIds, setChefErgaenzungIds] = useState<string[]>([])
  const [nachtragsIds, setNachtragsIds] = useState<string[]>([])
  const [nachtragsAltIds, setNachtragsAltIds] = useState<string[]>([])

  const [kochPanelKey, setKochPanelKey] = useState<string | null>(null)
  const [restPortionen, setRestPortionen] = useState<Record<string, number>>({})
  const [vorratHinweis, setVorratHinweis] = useState(false)

  const [wishFormKey, setWishFormKey] = useState<string | null>(null)
  const [nextWeekWishInput, setNextWeekWishInput] = useState('')
  const [nextWeekWishSaving, setNextWeekWishSaving] = useState(false)

  // ── Nächste Woche – Plan-State ────────────────────────────────────────────
  const [nwExpanded, setNwExpanded] = useState(false)
  const [nwPlanLoading, setNwPlanLoading] = useState(false)
  const [nwPendingPlan, setNwPendingPlan] = useState<WeekPlanEntry[] | null>(null)
  const [nwPendingMeals, setNwPendingMeals] = useState<Record<string, Rezept>>({})
  const [nwSlotLoading, setNwSlotLoading] = useState<string | null>(null)
  const [nwEditMealKey, setNwEditMealKey] = useState<string | null>(null)
  const [nwMealSubMode, setNwMealSubMode] = useState<'manual' | 'pantry' | null>(null)
  const [nwManualDish, setNwManualDish] = useState('')
  const [nwSaving, setNwSaving] = useState(false)

  async function submitNextWeekWish() {
    if (!nextWeekWishInput.trim() || !onNextWeekDataChange) return
    setNextWeekWishSaving(true)
    const wish: NextWeekWish = { id: crypto.randomUUID(), person: currentUser, text: nextWeekWishInput.trim() }
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    const currentWishes = nextWeekData?.wishes ?? []
    await onNextWeekDataChange({ wishes: [...currentWishes, wish] }, nextMonday)
    setNextWeekWishInput('')
    setNextWeekWishSaving(false)
  }

  async function generateNwPlan() {
    if (!onNextWeekDataChange) return
    setNwPlanLoading(true)
    setNwPendingPlan(null)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        neuTage: planWE ? [...WOCHENTAGE] : WOCHENTAGE.slice(0, 5),
        wishes: (nextWeekData?.wishes ?? []).map(w => ({
          id: w.id, person: w.person, tag: 'alle', slot: 'Abend' as WochenSlot,
          type: 'ergaenzung' as const, text: w.text, postConfirm: false,
        })),
        familyPrompt,
      })
      setNwPendingPlan(result)
      setNwPendingMeals(newMeals)
    } catch {
      // silently fail
    }
    setNwPlanLoading(false)
  }

  async function replanNwPendingSlot(tag: string, slot: WochenSlot) {
    if (!nwPendingPlan) return
    const key = `${tag}-${slot}`
    setNwSlotLoading(key)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag: slot === 'Abend' ? false : planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: nwPendingPlan.filter(e => !(e.tag === tag && e.slot === slot)),
        neuTage: [tag],
        familyPrompt,
      })
      const newEntry = result.find(e => e.tag === tag && e.slot === slot)
      if (newEntry) {
        setNwPendingPlan(prev => prev!.map(e => e.tag === tag && e.slot === slot ? newEntry : e))
        setNwPendingMeals(prev => ({ ...prev, ...newMeals }))
      }
    } catch {
      // silently fail
    }
    setNwSlotLoading(null)
  }

  async function acceptNwPlan() {
    if (!nwPendingPlan || !onNextWeekDataChange) return
    setNwSaving(true)
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    await onNextWeekDataChange({ plan: nwPendingPlan, mealsData: nwPendingMeals, planConfirmed: false }, nextMonday)
    setNwPendingPlan(null)
    setNwPendingMeals({})
    setNwSaving(false)
  }

  async function confirmNwWeek() {
    if (!onNextWeekDataChange) return
    setNwSaving(true)
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    await onNextWeekDataChange({ planConfirmed: true }, nextMonday)
    setNwSaving(false)
  }

  async function replanNwSlot(tag: string, slot: WochenSlot) {
    if (!onNextWeekDataChange || !nextWeekData?.plan) return
    const key = `${tag}-${slot}`
    setNwSlotLoading(key)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag: slot === 'Abend' ? false : planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: nextWeekData.plan.filter(e => !(e.tag === tag && e.slot === slot)),
        neuTage: [tag],
        familyPrompt,
      })
      const newEntry = result.find(e => e.tag === tag && e.slot === slot)
      if (newEntry) {
        const nextMonday = nextWeekStart ?? getNextMondayIso()
        const newPlan = nextWeekData.plan.map(e => e.tag === tag && e.slot === slot ? newEntry : e)
        await onNextWeekDataChange({ plan: newPlan, mealsData: { ...nextWeekData.mealsData, ...newMeals } }, nextMonday)
      }
    } catch {
      // silently fail
    }
    setNwSlotLoading(null)
  }

  function applyNwManualDish(tag: string, slot: WochenSlot, name: string) {
    if (!name.trim() || !onNextWeekDataChange || !nextWeekData?.plan) return
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    const newPlan = nextWeekData.plan.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name.trim(), emoji: '🍽️', quelle: 'manuell' } : e
    )
    void onNextWeekDataChange({ plan: newPlan, mealsData: nextWeekData.mealsData }, nextMonday)
    setNwEditMealKey(null)
    setNwMealSubMode(null)
    setNwManualDish('')
  }

  function applyNwStockItem(tag: string, slot: WochenSlot, name: string, emoji: string) {
    if (!onNextWeekDataChange || !nextWeekData?.plan) return
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    const newPlan = nextWeekData.plan.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name, emoji, quelle: 'vorrat' } : e
    )
    void onNextWeekDataChange({ plan: newPlan, mealsData: nextWeekData.mealsData }, nextMonday)
    setNwEditMealKey(null)
    setNwMealSubMode(null)
  }

  function changeNwChef(tag: string, slot: WochenSlot, chef: Chef) {
    if (!onNextWeekDataChange || !nextWeekData?.plan) return
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    const newPlan = nextWeekData.plan.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, chef } : e
    )
    void onNextWeekDataChange({ plan: newPlan, mealsData: nextWeekData.mealsData }, nextMonday)
  }

  async function replanSlot(tag: string, slot: WochenSlot) {
    const key = `${tag}-${slot}`
    closeMealPanel()
    setSlotLoading(key)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag: slot === 'Abend' ? false : planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: weekPlan.filter(e => !(e.tag === tag && e.slot === slot)),
        neuTage: [tag],
        familyPrompt,
      })
      const newEntry = result.find(e => e.tag === tag && e.slot === slot)
      if (newEntry) {
        const kept = weekPlan.filter(e => e.tag === tag && e.slot !== slot)
        setPendingDay({ tag, entries: [...kept, newEntry] })
        setPendingDayMeals(newMeals)
      }
    } catch {
      // silently fail
    }
    setSlotLoading(null)
  }

  function applyActiveManualDish(tag: string, slot: WochenSlot, name: string) {
    if (!name.trim()) return
    const newPlan = weekPlan.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name.trim(), emoji: '🍽️', quelle: 'manuell' } : e
    )
    void onWeekPlanChange(newPlan, mealsData)
    closeMealPanel()
  }

  function applyActiveStockItem(tag: string, slot: WochenSlot, name: string, emoji: string) {
    const newPlan = weekPlan.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name, emoji, quelle: 'vorrat' } : e
    )
    void onWeekPlanChange(newPlan, mealsData)
    closeMealPanel()
  }

  function openWishForm(tag: string, slot: WochenSlot) { setWishFormKey(`${tag}-${slot}`) }
  function closeWishForm() { setWishFormKey(null) }

  async function handleWishSubmit(wish: Wish) {
    if (planConfirmed && currentUser === wochenchef && wish.type === 'ergaenzung') {
      const meal = weekPlan.find(e => e.tag === wish.tag && e.slot === wish.slot)
      const newItems: ShoppingItem[] = wish.text.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(part => ({
        id: crypto.randomUUID(), name: part, menge: '', kategorie: 'Sonstiges',
        erledigt: false, tag: wish.tag, slot: wish.slot, gericht: meal?.gericht,
      }))
      if (newItems.length > 0) await onShoppingListChange([...shoppingList, ...newItems])
      const filtered = wishes.filter(w => !(
        w.person === wish.person && w.tag === wish.tag && w.slot === wish.slot && w.type === wish.type
      ))
      await onWishesChange([...filtered, wish])
      closeWishForm()
      return
    }
    const tagged = planConfirmed ? { ...wish, postConfirm: true } : wish
    const filtered = wishes.filter(w => !(
      w.person === wish.person && w.tag === wish.tag && w.slot === wish.slot && w.type === wish.type
    ))
    await onWishesChange([...filtered, tagged])
    closeWishForm()
  }

  async function removeWish(id: string) {
    await onWishesChange(wishes.filter(w => w.id !== id))
  }

  const [chefPickerKey, setChefPickerKey] = useState<string | null>(null)
  const [editMealKey, setEditMealKey] = useState<string | null>(null)
  const [mealSubMode, setMealSubMode] = useState<'manual' | 'pantry' | null>(null)
  const [manualDishInput, setManualDishInput] = useState('')
  const [attendanceEditKey, setAttendanceEditKey] = useState<string | null>(null)

  function getSlotAnwesend(tag: string, slot: WochenSlot): Chef[] {
    const allChefs = (members.length ? members : DEFAULT_MEMBERS).map(m => m.id as Chef)
    const day = attendance.find(a => a.tag === tag) as unknown as Record<string, unknown> | undefined
    if (!day) return allChefs
    if (slot === 'Mittag') return (day.mittagAnwesend as Chef[] | undefined) ?? (day.anwesend as Chef[] | undefined) ?? allChefs
    return (day.abendAnwesend as Chef[] | undefined) ?? (day.anwesend as Chef[] | undefined) ?? allChefs
  }

  async function toggleSlotAttendance(tag: string, slot: WochenSlot, chef: Chef) {
    const allChefs = (members.length ? members : DEFAULT_MEMBERS).map(m => m.id as Chef)
    const existing = attendance.find(a => a.tag === tag) as unknown as Record<string, unknown> | undefined
    const base: DayAttendance = existing
      ? {
          tag,
          mittagAnwesend: (existing.mittagAnwesend as Chef[] | undefined) ?? (existing.anwesend as Chef[] | undefined) ?? allChefs,
          abendAnwesend: (existing.abendAnwesend as Chef[] | undefined) ?? (existing.anwesend as Chef[] | undefined) ?? allChefs,
          gaeste: (existing.gaeste as number | undefined) ?? 0,
        }
      : { tag, mittagAnwesend: allChefs, abendAnwesend: allChefs, gaeste: 0 }
    const field = slot === 'Mittag' ? 'mittagAnwesend' : 'abendAnwesend'
    const current = base[field]
    const next = current.includes(chef) ? current.filter(c => c !== chef) : [...current, chef]
    await onAttendanceChange([...attendance.filter(a => a.tag !== tag), { ...base, [field]: next }])
  }

  function closeMealPanel() {
    setEditMealKey(null)
    setChefPickerKey(null)
    setMealSubMode(null)
    setManualDishInput('')
  }

  function toggleEditMeal(key: string) {
    if (editMealKey === key) { closeMealPanel(); return }
    setEditMealKey(key)
    setChefPickerKey(null)
    setMealSubMode(null)
    setManualDishInput('')
  }

  function changePendingChef(tag: string, slot: WochenSlot, chef: Chef) {
    setPendingPlan(prev => prev.map(e => e.tag === tag && e.slot === slot ? { ...e, chef } : e))
    closeMealPanel()
  }

  async function changeActiveChef(tag: string, slot: WochenSlot, chef: Chef) {
    closeMealPanel()
    if (currentUser === wochenchef) {
      const newPlan = weekPlan.map(e => e.tag === tag && e.slot === slot ? { ...e, chef } : e)
      await onWeekPlanChange(newPlan, mealsData)
    } else {
      // Nur Chef-Änderung als Proposal – kein Gericht-Snapshot, damit Gericht-Wünsche unabhängig bleiben
      await onProposalsChange([...proposals, {
        id: crypto.randomUUID(),
        tag,
        slot,
        vonChef: currentUser,
        fuerChef: wochenchef,
        newChef: chef,
        createdAt: new Date().toISOString(),
      }])
    }
  }

  async function acceptProposal(proposal: ChangeProposal) {
    // Fallback für alte DB-Proposals die noch `entry` statt `newChef` haben
    const chef = proposal.newChef ?? (proposal as unknown as Record<string, WeekPlanEntry>).entry?.chef
    if (!chef) return
    const newPlan = weekPlan.map(e =>
      e.tag === proposal.tag && e.slot === proposal.slot ? { ...e, chef } : e
    )
    await onWeekPlanChange(newPlan, mealsData)
    await onProposalsChange(proposals.filter(p => p.id !== proposal.id))
  }

  async function rejectProposal(id: string) {
    await onProposalsChange(proposals.filter(p => p.id !== id))
  }

  async function acceptShoppingProposal(proposal: ChangeProposal) {
    if (!proposal.vorgeschlagene || !onShoppingPersonsChange) return
    await onShoppingPersonsChange({ ...shoppingPersons, [proposal.tag]: proposal.vorgeschlagene })
    await onProposalsChange(proposals.filter(p => p.id !== proposal.id))
  }

  function renderWochenchefDecisions() {
    if (currentUser !== wochenchef) return null
    const nachtragsAltWishes = wishes.filter((w): w is Extract<Wish, { type: 'alternative' }> & { postConfirm: true } => !!(w.postConfirm && w.type === 'alternative'))
    const nachtragsErgWishes = wishes.filter(w => w.postConfirm && w.type === 'ergaenzung')
    const chefProposals = proposals.filter(p => !p.type || p.type === 'chef')
    const einkaufProposals = proposals.filter(p => p.type === 'einkauf')
    const total = chefProposals.length + einkaufProposals.length + nachtragsAltWishes.length + nachtragsErgWishes.length
    const showPreConfirm = !planConfirmed && weekPlan.length > 0
    if (total === 0 && !showPreConfirm) return null
    return (
      <div style={{ marginBottom: 14, border: `1px solid ${total > 0 ? '#FCD34D' : '#B2DFCC'}`, borderRadius: 12, overflow: 'hidden' }}>
        {total > 0 && (
          <div style={{ background: '#FFFBEB', padding: '10px 14px 8px', borderBottom: '1px solid #FDE68A' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>📋 Offene Entscheidungen ({total})</span>
          </div>
        )}

        {/* Koch-Änderungsvorschläge */}
        {chefProposals.length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: (einkaufProposals.length + nachtragsAltWishes.length + nachtragsErgWishes.length) > 0 ? '1px solid #FDE68A' : 'none', background: '#FFFBEB' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>👨‍🍳 Koch-Änderungen ({chefProposals.length})</div>
            {chefProposals.map(p => {
              const slotLabel = p.slot === 'Mittag' ? '🌞' : '🌙'
              const currentEntry = weekPlan.find(e => e.tag === p.tag && e.slot === p.slot)
              const toChef = p.newChef ?? (p as unknown as Record<string, WeekPlanEntry>).entry?.chef
              if (!toChef) return null
              const fromChef = currentEntry?.chef
              return (
                <div key={p.id} style={{ background: 'white', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: '#92400E', fontWeight: 700, marginBottom: 3 }}>{p.tag} · {slotLabel} {p.slot}</div>
                  <div style={{ fontSize: 12, color: '#111', marginBottom: 2 }}>
                    <span style={{ color: '#888' }}>{personNames[p.vonChef]} schlägt vor: Koch</span>
                    {fromChef && fromChef !== toChef && <span style={{ color: '#aaa' }}> {personNames[fromChef]} →</span>}
                    <span style={{ fontWeight: 700 }}> {personNames[toChef]}</span>
                  </div>
                  {currentEntry && <div style={{ fontSize: 10, color: '#bbb', marginBottom: 6 }}>{currentEntry.emoji} {currentEntry.gericht} bleibt unverändert</div>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => acceptProposal(p)} style={{ flex: 1, padding: '5px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✅ Übernehmen</button>
                    <button onClick={() => rejectProposal(p.id)} style={{ padding: '5px 10px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#888' }}>✕ Ablehnen</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Einkaufsperson-Vorschläge */}
        {einkaufProposals.length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: (nachtragsAltWishes.length + nachtragsErgWishes.length) > 0 ? '1px solid #FDE68A' : 'none', background: '#FFFBEB' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>🛒 Einkaufsperson ({einkaufProposals.length})</div>
            {einkaufProposals.map(p => {
              const currentPerson = shoppingPersons[p.tag]
              return (
                <div key={p.id} style={{ background: 'white', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: '#92400E', fontWeight: 700, marginBottom: 3 }}>🛒 {p.tag}</div>
                  <div style={{ fontSize: 12, color: '#111', marginBottom: 6 }}>
                    <span style={{ color: '#888' }}>{personNames[p.vonChef]} schlägt vor:</span>
                    {currentPerson && currentPerson !== p.vorgeschlagene && <span style={{ color: '#aaa' }}> {personNames[currentPerson]} →</span>}
                    <span style={{ fontWeight: 700 }}> {personNames[p.vorgeschlagene!]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => acceptShoppingProposal(p)} style={{ flex: 1, padding: '5px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✅ Übernehmen</button>
                    <button onClick={() => rejectProposal(p.id)} style={{ padding: '5px 10px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#888' }}>✕ Ablehnen</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nachträgliche Alternativen (Gerichtswünsche) */}
        {nachtragsAltWishes.length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: nachtragsErgWishes.length > 0 ? '1px solid #BFDBFE' : 'none', background: '#EFF6FF' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1E40AF', marginBottom: 4 }}>🔄 Alternative Gerichte ({nachtragsAltWishes.length})</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Ankreuzen was du übernehmen möchtest:</div>
            {nachtragsAltWishes.map(w => {
              const checked = nachtragsAltIds.includes(w.id)
              const c = CFG[w.person] ?? CFG.MA
              const original = weekPlan.find(e => e.tag === w.tag && e.slot === w.slot)
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button onClick={() => setNachtragsAltIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])}
                    style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer', border: `1px solid ${checked ? '#1D9E75' : '#ddd'}`, background: checked ? '#1D9E75' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </button>
                  <span style={{ fontSize: 12, flex: 1 }}>
                    <span style={{ color: '#888', marginRight: 4 }}>{w.tag.slice(0, 2)} {w.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                    <span style={{ fontWeight: 600 }}>{w.emoji} {w.dishName}</span>
                    {original && <span style={{ color: '#aaa' }}> statt {original.emoji} {original.gericht}</span>}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>{personNames[w.person]}</span>
                </div>
              )
            })}
            <button className="btn primary" onClick={confirmNachtragsAlternativen} disabled={saving}
              style={{ background: '#1D9E75', fontSize: 12, marginTop: 6 }}>
              {saving ? '⏳…' : '✅ Entscheidung übernehmen'}
            </button>
            <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>Nicht angekreuzte Alternativen werden verworfen.</div>
          </div>
        )}

        {/* Nachtrags-Ergänzungen (Zutaten) */}
        {nachtragsErgWishes.length > 0 && (
          <div style={{ padding: '10px 14px', background: '#FFFBEB', borderBottom: showPreConfirm ? '1px solid #B2DFCC' : 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>📬 Zutat-Ergänzungen ({nachtragsErgWishes.length})</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Ankreuzen, was auf die Einkaufsliste soll:</div>
            {nachtragsErgWishes.map(w => {
              const checked = nachtragsIds.includes(w.id)
              const c = CFG[w.person] ?? CFG.MA
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button onClick={() => setNachtragsIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])}
                    style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer', border: `1px solid ${checked ? '#1D9E75' : '#ddd'}`, background: checked ? '#1D9E75' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </button>
                  <span style={{ fontSize: 12, flex: 1, color: '#555', fontStyle: 'italic' }}>„{w.type === 'ergaenzung' ? w.text : ''}"</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{w.tag.slice(0, 2)} {w.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>{personNames[w.person]}</span>
                </div>
              )
            })}
            <button className="btn primary" onClick={confirmNachtraege} disabled={saving || nachtragsIds.length === 0}
              style={{ background: '#1D9E75', fontSize: 12, marginTop: 6, opacity: nachtragsIds.length === 0 ? 0.4 : 1 }}>
              {saving ? '⏳…' : `🛒 ${nachtragsIds.length} Ergänzung(en) zur Einkaufsliste`}
            </button>
          </div>
        )}

        {/* Pre-confirm: Wochenchef bestätigt den angenommenen Wochenplan */}
        {showPreConfirm && (
          <div style={{ padding: '12px 14px', background: '#F0FAF5' }}>
            <div style={{ fontSize: 12, color: '#0F6E56', fontWeight: 600, marginBottom: 6 }}>
              Wochenplan als Wochenchef bestätigen
            </div>
            {(() => {
              const altCount = Object.keys(chefAltSelection).filter(k => chefAltSelection[k] !== 'original').length
              const ergCount = chefErgaenzungIds.length
              if (altCount === 0 && ergCount === 0) return null
              return (
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                  {altCount} Alternative(n) übernommen · {ergCount} Ergänzung(en) auf Einkaufsliste
                </div>
              )
            })()}
            <button
              className="btn primary"
              onClick={confirmAsChef}
              disabled={saving}
              style={{ background: '#1D9E75', fontSize: 13 }}
            >
              {saving ? '⏳ Speichern…' : `✅ Wochenplan bestätigen (${personNames[wochenchef]})`}
            </button>
          </div>
        )}
      </div>
    )
  }

  const [dayLoading, setDayLoading] = useState<string | null>(null)
  const [slotLoading, setSlotLoading] = useState<string | null>(null)
  const [pendingDay, setPendingDay] = useState<{ tag: string; entries: WeekPlanEntry[] } | null>(null)

  function changePendingDayChef(slot: WochenSlot, chef: Chef) {
    setPendingDay(prev => prev ? { ...prev, entries: prev.entries.map(e => e.slot === slot ? { ...e, chef } : e) } : null)
    setChefPickerKey(null)
  }

  async function confirmPendingDay() {
    if (!pendingDay) return
    setSaving(true)
    const newPlan = [...weekPlan.filter(e => e.tag !== pendingDay.tag), ...pendingDay.entries]
    await onWeekPlanChange(newPlan, { ...mealsData, ...pendingDayMeals })
    await onPlanConfirm?.(pendingDay.entries)
    setPendingDay(null)
    setPendingDayMeals({})
    setSaving(false)
  }

  function applyManualDish(tag: string, slot: WochenSlot, name: string) {
    if (!name.trim()) return
    setPendingPlan(prev => prev.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name.trim(), emoji: '🍽' } : e
    ))
    closeMealPanel()
  }

  function applyStockItem(tag: string, slot: WochenSlot, name: string, emoji: string) {
    setPendingPlan(prev => prev.map(e =>
      e.tag === tag && e.slot === slot ? { ...e, gericht: name, emoji } : e
    ))
    closeMealPanel()
  }

  async function replanPendingSlot(tag: string, slot: 'Mittag' | 'Abend') {
    closeMealPanel()
    const key = `${tag}-${slot}`
    setSlotLoading(key)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag: slot === 'Abend' ? false : planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: pendingPlan.filter(e => !(e.tag === tag && e.slot === slot)),
        neuTage: [tag],
        wishes: wishes.filter(w => w.tag === tag && w.slot === slot),
        familyPrompt,
      })
      const newEntry = result.find(e => e.tag === tag && e.slot === slot)
      if (newEntry) {
        setPendingPlan(prev => prev.map(e => e.tag === tag && e.slot === slot ? newEntry : e))
        setPendingPlanMeals(prev => ({ ...prev, ...newMeals }))
      }
    } catch {
      // silently fail
    }
    setSlotLoading(null)
  }

  async function replanPendingDay(tag: string) {
    closeMealPanel()
    setDayLoading(tag)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: pendingPlan.filter(e => e.tag !== tag),
        neuTage: [tag],
        wishes: wishes.filter(w => w.tag === tag),
        familyPrompt,
      })
      setPendingPlan(prev => [...prev.filter(e => e.tag !== tag), ...result.filter(e => e.tag === tag)])
      setPendingPlanMeals(prev => ({ ...prev, ...newMeals }))
    } catch {
      // silently fail
    }
    setDayLoading(null)
  }

  async function replanDay(tag: string) {
    closeWishForm()
    setChefPickerKey(null)
    setEditMealKey(null)
    setPendingDay(null)
    setDayLoading(tag)
    try {
      const { plan: result, mealsData: newMeals } = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: weekPlan.filter(e => e.tag !== tag),
        neuTage: [tag],
        wishes: wishes.filter(w => w.tag === tag),
        familyPrompt,
      })
      setPendingDay({ tag, entries: result.filter(e => e.tag === tag) })
      setPendingDayMeals(newMeals)
    } catch {
      // silently fail — Nutzer kann nochmal tippen
    }
    setDayLoading(null)
  }

  const today = todayGerman()
  const activeDays = planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)
  const plannedDays = WOCHENTAGE.filter(t => weekPlan.some(e => e.tag === t))
  const todayIdx = activeDays.indexOf(today)
  const nextDays = activeDays.slice(todayIdx + 1, todayIdx + 3)
  const allChefIds = (members.length ? members : DEFAULT_MEMBERS).map(m => m.id as Chef)

  function slotAnwesendLabel(tag: string, slot: WochenSlot): string {
    const anw = getSlotAnwesend(tag, slot)
    if (anw.length === allChefIds.length) return 'Alle'
    if (anw.length === 0) return 'Niemand'
    return anw.map(c => personNames[c] ?? c).join(', ')
  }

  function hasPendingChefProposal(tag: string, slot: WochenSlot): boolean {
    return currentUser !== wochenchef &&
      proposals.some(p => p.vonChef === currentUser && p.tag === tag && p.slot === slot)
  }

  function slotEssenLabel(tag: string, slot: WochenSlot): string {
    const anw = getSlotAnwesend(tag, slot)
    const day = attendance.find(a => a.tag === tag) as unknown as Record<string, unknown> | undefined
    const gaeste = (day?.gaeste as number | undefined) ?? 0
    const total = anw.length + gaeste
    if (total === 0) return '0'
    if (anw.length === allChefIds.length && gaeste === 0) return 'alle'
    return `${total}${gaeste > 0 ? ` (${gaeste} Gast${gaeste > 1 ? 'e' : ''})` : ''}`
  }

  function goToPlan() {
    setView('plan')
    setPlanState('options')
    setError('')
    setNeuTage(new Set(['alle']))
  }

  async function startPlanning() {
    setPlanState('loading')
    setError('')
    const tage = neuTage.has('alle')
      ? activeDays
      : activeDays.filter(t => neuTage.has(t))
    const behaltene = weekPlan.filter(e => !tage.includes(e.tag))
    try {
      const { plan: newPlan, mealsData: newMeals } = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene,
        neuTage: tage,
        wishes: wishes.filter(w => tage.includes(w.tag)),
        familyPrompt,
        lastDishes,
      })
      setPendingPlan(newPlan)
      setPendingPlanMeals(newMeals)
      closeMealPanel()
      setPlanState('results')
    } catch {
      setError('Rémy konnte nicht planen. Bitte erneut versuchen.')
      setPlanState('options')
    }
  }

  async function acceptPlan() {
    setSaving(true)
    await onWeekPlanChange(pendingPlan, { ...mealsData, ...pendingPlanMeals })
    await onPlanConfirm?.(pendingPlan)
    await onPlanConfirmedChange(false)

    // Auto-Entfernen aus Gefriertruhe: für Reste-Gerichte exakt matchen,
    // für gefriertruhe-Gerichte per exakter Namensübereinstimmung
    const matchedIds = new Set<string>()
    for (const entry of pendingPlan) {
      if (entry.quelle !== 'reste' && entry.quelle !== 'gefriertruhe') continue
      const searchName = entry.quelle === 'reste'
        ? entry.gericht.replace(/^Reste:\s*/i, '').trim()
        : entry.gericht
      const match = freezerItems.find(
        f => !matchedIds.has(f.id) && f.name.toLowerCase() === searchName.toLowerCase()
      )
      if (match) {
        matchedIds.add(match.id)
        await deleteFreezerItem(match.id)
      }
    }
    if (matchedIds.size > 0) {
      onFreezerChange(freezerItems.filter(f => !matchedIds.has(f.id)))
    }

    // Hinweis anzeigen wenn Speisekammer-Einträge im Plan sind
    const hatSpeisekammer = pendingPlan.some(e => e.quelle === 'speisekammer')
    if (hatSpeisekammer) setVorratHinweis(true)

    // Gerichte-History aktualisieren (Abend-Gerichte, keine Reste)
    const neueAbendGerichte = [...new Set(
      pendingPlan
        .filter(e => e.slot === 'Abend' && !e.gericht.startsWith('Reste:'))
        .map(e => e.gericht)
    )]
    const aktualisierteHistory = [...new Set([...neueAbendGerichte, ...lastDishes])].slice(0, 24)
    await saveLastDishes(aktualisierteHistory)

    setSaving(false)
    setPendingPlan([])
    setPendingPlanMeals({})
    setPlanState('options')
    setNeuTage(new Set(['alle']))
    setView('home')
  }

  async function confirmAsChef() {
    setSaving(true)

    // Gewählte Alternativen in weekPlan übernehmen
    let finalPlan = [...weekPlan]
    const confirmedAlts: { gericht: string; emoji: string }[] = []
    for (const [key, selectedId] of Object.entries(chefAltSelection)) {
      if (selectedId === 'original') continue
      const wish = wishes.find(w => w.id === selectedId)
      if (!wish || wish.type !== 'alternative') continue
      const dashIdx = key.lastIndexOf('-')
      const tag = key.slice(0, dashIdx)
      const slot = key.slice(dashIdx + 1) as WochenSlot
      finalPlan = finalPlan.map(e =>
        e.tag === tag && e.slot === slot
          ? { ...e, gericht: wish.dishName, emoji: wish.emoji }
          : e
      )
      if (!mealsData[wish.dishName]) confirmedAlts.push({ gericht: wish.dishName, emoji: wish.emoji })
    }

    // Rezepte (inkl. ersetzteZutaten) für neu bestätigte Alternativ-Gerichte laden
    const newMeals: Record<string, Rezept> = {}
    await Promise.all(confirmedAlts.map(async ({ gericht, emoji }) => {
      const rezept = await generateRecipe(gericht, emoji, getFreezerListString(freezerItems), getPantryListString(pantryItems), familyPrompt)
      if (rezept) newMeals[gericht] = rezept
    }))
    const updatedMealsData = { ...mealsData, ...newMeals }

    // Aktivierte Ergänzungen an Einkaufsliste übergeben
    const newItems: ShoppingItem[] = []
    for (const wishId of chefErgaenzungIds) {
      const wish = wishes.find(w => w.id === wishId)
      if (!wish || wish.type !== 'ergaenzung') continue
      const meal = weekPlan.find(e => e.tag === wish.tag && e.slot === wish.slot)
      for (const part of wish.text.split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
        newItems.push({
          id: crypto.randomUUID(),
          name: part,
          menge: '',
          kategorie: 'Sonstiges',
          erledigt: false,
          tag: wish.tag,
          slot: wish.slot,
          gericht: meal?.gericht,
        })
      }
    }

    const newWishes = wishes.filter(w => w.postConfirm)
    await onWeekPlanAndWishesChange(finalPlan, updatedMealsData, newWishes)
    if (newItems.length > 0) {
      await onShoppingListChange([...shoppingList, ...newItems])
    }
    await onPlanConfirmedChange(true)

    setChefAltSelection({})
    setChefErgaenzungIds([])
    setSaving(false)
  }

  async function confirmNachtraege() {
    setSaving(true)
    const newItems: ShoppingItem[] = []
    for (const wishId of nachtragsIds) {
      const wish = wishes.find(w => w.id === wishId)
      if (!wish || wish.type !== 'ergaenzung') continue
      const meal = weekPlan.find(e => e.tag === wish.tag && e.slot === wish.slot)
      for (const part of wish.text.split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
        newItems.push({
          id: crypto.randomUUID(),
          name: part,
          menge: '',
          kategorie: 'Sonstiges',
          erledigt: false,
          tag: wish.tag,
          slot: wish.slot,
          gericht: meal?.gericht,
        })
      }
    }
    if (newItems.length > 0) {
      await onShoppingListChange([...shoppingList, ...newItems])
    }
    const processedIds = new Set(nachtragsIds)
    await onWishesChange(wishes.filter(w => !processedIds.has(w.id)))
    setNachtragsIds([])
    setSaving(false)
  }

  async function confirmNachtragsAlternativen() {
    setSaving(true)
    const nachtragsAltWishes = wishes.filter((w): w is Extract<Wish, { type: 'alternative' }> & { postConfirm: true } => !!(w.postConfirm && w.type === 'alternative'))
    let finalPlan = [...weekPlan]
    const newMeals: Record<string, Rezept> = {}
    await Promise.all(nachtragsAltIds.map(async (wishId) => {
      const wish = wishes.find(w => w.id === wishId)
      if (!wish || wish.type !== 'alternative') return
      finalPlan = finalPlan.map(e =>
        e.tag === wish.tag && e.slot === wish.slot
          ? { ...e, gericht: wish.dishName, emoji: wish.emoji }
          : e
      )
      if (!mealsData[wish.dishName]) {
        const rezept = await generateRecipe(wish.dishName, wish.emoji, getFreezerListString(freezerItems), getPantryListString(pantryItems), familyPrompt)
        if (rezept) newMeals[wish.dishName] = rezept
      }
    }))
    const processedIds = new Set(nachtragsAltWishes.map(w => w.id))
    const newWishes = wishes.filter(w => !processedIds.has(w.id))
    await onWeekPlanAndWishesChange(finalPlan, { ...mealsData, ...newMeals }, newWishes)
    setNachtragsAltIds([])
    setSaving(false)
  }

  async function handleEinfrieren(tag: string, slot: WochenSlot, entry: WeekPlanEntry) {
    const key = `${tag}-${slot}`
    const portionen = restPortionen[key] ?? 1
    const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const item = await addFreezerItem({
      typ: 'fertig',
      emoji: entry.emoji,
      name: entry.gericht,
      menge: `${portionen} Portion${portionen !== 1 ? 'en' : ''}`,
      datum,
      ampel: 'green',
    })
    if (item) onFreezerChange([...freezerItems, item])
    setKochPanelKey(null)
  }

  async function handleMorgenEinplanen(tag: string, slot: WochenSlot, entry: WeekPlanEntry) {
    const key = `${tag}-${slot}`
    const tagIdx = WOCHENTAGE.indexOf(tag)
    const nextTag = WOCHENTAGE[tagIdx + 1]
    if (nextTag) {
      const neuerSlot: WochenSlot = planMittag ? 'Mittag' : 'Abend'
      const resteEntry: WeekPlanEntry = {
        tag: nextTag, slot: neuerSlot, emoji: entry.emoji,
        gericht: `Reste: ${entry.gericht}`, minuten: 10, quelle: 'kuehlschrank', chef: entry.chef,
      }
      const ohneAlten = weekPlan.filter(e => !(e.tag === nextTag && e.slot === neuerSlot))
      await onWeekPlanChange([...ohneAlten, resteEntry], mealsData)
    }
    setKochPanelKey(null)
    setRestPortionen(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function toggleKochPanel(key: string) {
    setKochPanelKey(prev => prev === key ? null : key)
  }

  function toggleNeuTag(tag: string) {
    const s = new Set(neuTage)
    if (tag === 'alle') {
      setNeuTage(s.has('alle') ? new Set<string>() : new Set(['alle']))
      return
    }
    s.delete('alle')
    s.has(tag) ? s.delete(tag) : s.add(tag)
    if (s.size === 0) s.add('alle')
    setNeuTage(s)
  }

  // ── Attendance view ────────────────────────────────────────────────────────
  if (view === 'attendance') {
    const confirmedCount = attendanceConfirmed.filter(c => allChefIds.includes(c)).length
    const displayDays = planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)

    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back" onClick={() => setView('home')}>‹</button>
          <h1>👥 Wer ist wann da?</h1>
        </div>
        <div className="content">
          {(members.length ? members : DEFAULT_MEMBERS).map(member => {
            const chef = member.id as Chef
            const isMine = chef === currentUser
            const isConfirmed = attendanceConfirmed.includes(chef)
            const canEdit = isMine || currentUser === wochenchef
            const cc = CFG[chef] ?? CFG.MA
            return (
              <div key={chef} style={{ borderRadius: 12, border: `1px solid ${isMine ? '#B2DFCC' : '#e5e7eb'}`, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: isMine ? '#F0FAF5' : '#f9fafb', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: cc.c }}>{member.name}{isMine ? ' · du' : ''}</span>
                  {isConfirmed
                    ? <span style={{ fontSize: 10, color: '#1D9E75', fontWeight: 700 }}>✓ bestätigt</span>
                    : <span style={{ fontSize: 10, color: '#aaa' }}>ausstehend</span>
                  }
                </div>
                <div style={{ padding: '8px 12px', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
                    <div style={{ width: 20, flexShrink: 0 }}>
                      <div style={{ height: 14 }} />
                      <div style={{ height: 26, lineHeight: '26px', fontSize: 10, color: '#aaa', textAlign: 'center' }}>☀</div>
                      <div style={{ height: 26, lineHeight: '26px', fontSize: 10, color: '#aaa', textAlign: 'center' }}>🌙</div>
                    </div>
                    {displayDays.map(tag => {
                      const mitOn = getSlotAnwesend(tag, 'Mittag').includes(chef)
                      const abdOn = getSlotAnwesend(tag, 'Abend').includes(chef)
                      return (
                        <div key={tag} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 9, color: '#bbb', height: 14, lineHeight: '14px', textAlign: 'center' }}>{tag.slice(0, 2)}</span>
                          <button
                            onClick={() => canEdit && toggleSlotAttendance(tag, 'Mittag', chef)}
                            disabled={!canEdit}
                            style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${mitOn ? cc.c : '#ddd'}`, background: mitOn ? cc.bg : 'white', cursor: canEdit ? 'pointer' : 'default', fontSize: 9, color: mitOn ? cc.c : 'transparent', fontWeight: 700 }}
                          >✓</button>
                          <button
                            onClick={() => canEdit && toggleSlotAttendance(tag, 'Abend', chef)}
                            disabled={!canEdit}
                            style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${abdOn ? cc.c : '#ddd'}`, background: abdOn ? cc.bg : 'white', cursor: canEdit ? 'pointer' : 'default', fontSize: 9, color: abdOn ? cc.c : 'transparent', fontWeight: 700 }}
                          >✓</button>
                        </div>
                      )
                    })}
                  </div>
                  {isMine && (
                    <button
                      onClick={() => {
                        const next = attendanceConfirmed.includes(chef) ? attendanceConfirmed : [...attendanceConfirmed, chef]
                        onAttendanceConfirmedChange(next)
                      }}
                      style={{ marginTop: 10, width: '100%', padding: '7px', border: 'none', borderRadius: 7, background: isConfirmed ? '#E1F5EE' : '#1D9E75', color: isConfirmed ? '#0F6E56' : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {isConfirmed ? '✓ Erneut bestätigen' : 'Meine Anwesenheit bestätigen'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 12, fontWeight: 500, color: confirmedCount < allChefIds.length ? '#92400E' : '#0F6E56' }}>
            {confirmedCount < allChefIds.length ? '⚠️' : '✅'} {confirmedCount} von {allChefIds.length} bestätigt
          </div>

          {currentUser === wochenchef && (
            <button className="btn primary" onClick={goToPlan} style={{ marginTop: 8, background: '#1D9E75' }}>
              🗓 Zur Wochenplanung →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Plan view ─────────────────────────────────────────────────────────────
  if (view === 'plan') {
    return (
      <div className="screen active">
        <div className="topbar">
          {planState !== 'loading' && (
            <button className="back" onClick={() => setView(weekPlan.length > 0 ? 'home' : 'home')}>‹</button>
          )}
          <h1>🐀 Wochenplan</h1>
        </div>
        <div className="content">

          {planState === 'loading' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🍲</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#085041', marginBottom: 8 }}>Rémy plant für dich…</div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Das dauert ca. 30 Sekunden – bitte warten.</div>
              <div style={{ fontSize: 12, color: '#bbb' }}>Wünsche & Vorräte werden berücksichtigt.</div>
            </div>
          )}

          {planState === 'options' && (
            <>
              {/* ── Anwesenheit (kompakte Statuszeile) ── */}
              {(() => {
                const confirmed = attendanceConfirmed.filter(c => allChefIds.includes(c)).length
                const total = allChefIds.length
                const done = confirmed === total
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '7px 10px', borderRadius: 8, border: `1px solid ${done ? '#B2DFCC' : '#FCD34D'}`, background: done ? '#F0FAF5' : '#FFFBEB', fontSize: 11 }}>
                    <span style={{ color: done ? '#0F6E56' : '#92400E' }}>{done ? '✅' : '⏳'} Anwesenheit: {confirmed}/{total}</span>
                    <button onClick={() => setView('attendance')} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#1D9E75', fontSize: 11, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                      {done ? 'Bearbeiten →' : 'Eintragen →'}
                    </button>
                  </div>
                )
              })()}
              {/* ── Schritt 2: Wochenplan ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#1D9E75', color: 'white', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Wochenplan erstellen</span>
              </div>
              {weekPlan.length > 0 && (
                <>
                  <div className="lbl">Welche Tage neu planen?</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    <button
                      className={`menu-tab${neuTage.has('alle') ? ' on' : ''}`}
                      onClick={() => toggleNeuTag('alle')}
                    >
                      Alle
                    </button>
                    {activeDays.map(t => (
                      <button
                        key={t}
                        className={`menu-tab${neuTage.has('alle') || neuTage.has(t) ? ' on' : ''}`}
                        onClick={() => toggleNeuTag(t)}
                      >
                        {t.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 20 }}>
                {planMittag ? '☀️ Mittag + 🌙 Abend' : '🌙 Nur Abend'}
                {' · '}
                {planWE ? 'Mo–So' : 'Mo–Fr'}
                <span style={{ marginLeft: 8, color: '#ccc' }}>(Einstellungen im Profil-Tab)</span>
              </div>
              {(() => {
                const planTage = neuTage.has('alle') ? activeDays : activeDays.filter(t => neuTage.has(t))
                const relevantWishes = wishes.filter(w => planTage.includes(w.tag))
                return relevantWishes.length > 0 ? (
                  <div style={{ marginBottom: 16 }}>
                    <div className="lbl">Wünsche für geplante Tage</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {relevantWishes.map(w => {
                        const c = CFG[w.person] ?? CFG.MA
                        const slotIcon = w.slot === 'Mittag' ? '🌞' : '🌙'
                        const content = w.type === 'ergaenzung' ? w.text : `${w.emoji} ${w.dishName}`
                        return (
                          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: c.bg, color: c.c, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
                            <span>{w.person}</span>
                            <span style={{ fontWeight: 400 }}>{w.tag.slice(0, 2)}</span>
                            <span style={{ fontWeight: 400 }}>{slotIcon}</span>
                            <span>·</span>
                            <span style={{ fontWeight: 400 }}>{w.type === 'alternative' ? '🔄 ' : ''}{content}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>werden an Rémy weitergegeben</div>
                  </div>
                ) : null
              })()}
              {error && (
                <div style={{ fontSize: 12, color: '#E24B4A', marginBottom: 12 }}>{error}</div>
              )}
              <button className="btn primary" onClick={startPlanning}>
                🐀 Rémy plant jetzt die Woche
              </button>
            </>
          )}

          {planState === 'results' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#085041', marginBottom: 4 }}>
                ✅ Rémy hat geplant
              </div>
              {slotLoading ? (
                <div style={{ fontSize: 11, color: '#085041', background: '#F0FAF5', border: '1px solid #B2DFCC', borderRadius: 8, padding: '7px 12px', marginBottom: 14 }}>
                  🐀 Rémy schlägt {slotLoading.replace(/-(?:Mittag|Abend)$/, '')} {slotLoading.endsWith('Mittag') ? '☀️ Mittag' : '🌙 Abend'} neu vor… andere ↺ kurz warten
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#bbb', marginBottom: 14 }}>Koch antippen zum Ändern · ↺ Slot neu würfeln</div>
              )}
              {WOCHENTAGE.filter(t => pendingPlan.some(e => e.tag === t)).map(tag => (
                <div key={tag} style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      {tag}
                    </span>
                  </div>
                  {dayLoading === tag && (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#aaa' }}>🐀 Rémy schlägt vor…</div>
                  )}
                  {dayLoading !== tag && (['Mittag', 'Abend'] as const).map(slot => {
                    const e = getSlot(pendingPlan, tag, slot)
                    if (!e) return null
                    const key = `${tag}-${slot}`
                    const isEditing = editMealKey === key
                    const stockItems = [...freezerItems, ...pantryItems]
                    return (
                      <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <SlotPill slot={slot} />
                          <span
                            onClick={() => toggleEditMeal(key)}
                            style={{ fontSize: 11, color: '#555', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                          >{personNames[e.chef]}</span>
                        </div>
                        <div style={{ padding: '3px 12px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{e.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {e.gericht}
                              {(pendingPlanMeals[e.gericht]?.ersetzteZutaten?.length ?? 0) > 0 && (
                                <span title={pendingPlanMeals[e.gericht]!.ersetzteZutaten!.join(' · ')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default' }}>!</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#aaa' }}>{e.minuten} min</div>
                          </div>
                          <button
                            onClick={() => replanPendingSlot(tag, slot)}
                            disabled={slotLoading !== null || dayLoading !== null}
                            style={{
                              width: 44, height: 44, flexShrink: 0,
                              border: 'none', borderRadius: 10,
                              background: 'transparent',
                              cursor: (slotLoading !== null || dayLoading !== null) ? 'default' : 'pointer',
                              fontSize: 20,
                              color: slotLoading === key ? '#1D9E75' : '#ccc',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: (slotLoading !== null && slotLoading !== key) || dayLoading !== null ? 0.3 : 1,
                            }}
                          >
                            {slotLoading === key ? '⏳' : '↺'}
                          </button>
                        </div>
                        {isEditing && (
                          <div style={{ background: '#f9f9f9', borderTop: '1px solid #eee', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>Koch ändern</div>
                            <ChefPicker current={e.chef} onSelect={chef => changePendingChef(tag, slot, chef)} personNames={personNames} members={members} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => replanPendingDay(tag)}
                                style={{ flex: 1, padding: '6px 4px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 11, color: '#555' }}
                              >↺ Rémy</button>
                              <button
                                onClick={() => { if (mealSubMode === 'manual') setMealSubMode(null); else { setMealSubMode('manual'); setManualDishInput('') } }}
                                style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'manual' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'manual' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'manual' ? '#0F6E56' : '#555' }}
                              >✏️ Eigenes</button>
                              <button
                                onClick={() => setMealSubMode(prev => prev === 'pantry' ? null : 'pantry')}
                                style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'pantry' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'pantry' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'pantry' ? '#0F6E56' : '#555' }}
                              >❄️ Vorrat</button>
                            </div>
                            {mealSubMode === 'manual' && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                  type="text"
                                  value={manualDishInput}
                                  onChange={ev => setManualDishInput(ev.target.value)}
                                  onKeyDown={ev => ev.key === 'Enter' && !!manualDishInput.trim() && applyManualDish(tag, slot, manualDishInput)}
                                  placeholder="Gerichtsname…"
                                  autoFocus
                                  style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }}
                                />
                                <button
                                  onClick={() => applyManualDish(tag, slot, manualDishInput)}
                                  disabled={!manualDishInput.trim()}
                                  style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 600, cursor: manualDishInput.trim() ? 'pointer' : 'default', opacity: manualDishInput.trim() ? 1 : 0.4 }}
                                >✓</button>
                              </div>
                            )}
                            {mealSubMode === 'pantry' && (
                              stockItems.length === 0 ? (
                                <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '4px 0' }}>Nichts im Vorrat</div>
                              ) : (
                                <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {stockItems.map(item => (
                                    <button
                                      key={item.id}
                                      onClick={() => applyStockItem(tag, slot, item.name, item.emoji)}
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid #eee', borderRadius: 6, background: 'white', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                      <span style={{ fontSize: 14 }}>{item.emoji}</span>
                                      <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{item.name}</span>
                                      <span style={{ fontSize: 10, color: '#bbb' }}>{item.menge}</span>
                                    </button>
                                  ))}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn primary" onClick={acceptPlan} disabled={saving}>
                  {saving ? '⏳ Speichern…' : '✅ Plan übernehmen'}
                </button>
                <button
                  className="btn"
                  onClick={() => { setPendingPlan([]); setPendingPlanMeals({}); setPlanState('options'); closeMealPanel() }}
                  style={{ width: 'auto', padding: '13px 16px' }}
                >
                  ✕
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  if (view === 'week') {
    return (
      <div className="screen active" style={{ position: 'relative' }}>
        {selectedMealName && (
          <RecipeModal name={selectedMealName} rezept={mealsData[selectedMealName] ?? null} onClose={() => setSelectedMealName(null)} />
        )}
        <div className="topbar">
          <button className="back" onClick={() => setView('home')}>‹</button>
          <h1>📋 Wochenplan</h1>
        </div>
        <div className="content">
          {renderWochenchefDecisions()}
          {plannedDays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🐀</div>
              <div style={{ fontSize: 13, color: '#aaa' }}>Noch kein Plan – Rémy wartet!</div>
            </div>
          ) : (
            plannedDays.map(tag => {
              const mittag = getSlot(weekPlan, tag, 'Mittag')
              const abend = getSlot(weekPlan, tag, 'Abend')
              const isLoading = dayLoading === tag
              const isPending = pendingDay?.tag === tag
              return (
                <div key={tag} style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: tag === today ? '#085041' : '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      {tag}
                    </span>
                    {tag === today && <span className="pill today">Heute</span>}
                    {!isLoading && !isPending && (
                      <button
                        onClick={() => replanDay(tag)}
                        title="Rémy neu vorschlagen"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#ccc', padding: '0 0 0 8px', lineHeight: 1 }}
                      >↺</button>
                    )}
                  </div>

                  {isLoading && (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#aaa' }}>🐀 Rémy schlägt vor…</div>
                  )}

                  {isPending && pendingDay && (
                    <>
                      <div style={{ padding: '4px 12px 2px', fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>Neuer Vorschlag · Koch antippen zum Ändern</div>
                      {pendingDay.entries.map(e => {
                        const key = `pd-${tag}-${e.slot}`
                        const c = CFG[e.chef] ?? CFG.MA
                        return (
                          <div key={e.slot}>
                            <div style={{ padding: '7px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <SlotPill slot={e.slot} />
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111' }}>{e.emoji} {e.gericht}</span>
                              <button onClick={() => setChefPickerKey(chefPickerKey === key ? null : key)} className="chef-b" style={{ background: c.bg, color: c.c, border: 'none', cursor: 'pointer' }}>{e.chef}</button>
                            </div>
                            {chefPickerKey === key && (
                              <ChefPicker current={e.chef} onSelect={chef => changePendingDayChef(e.slot, chef)} personNames={personNames} members={members} />
                            )}
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
                        <button onClick={confirmPendingDay} disabled={saving} style={{ flex: 1, padding: '7px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                          {saving ? '⏳…' : `✅ Bestätigen (${personNames[wochenchef]})`}
                        </button>
                        <button onClick={() => setPendingDay(null)} style={{ padding: '7px 12px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#666' }}>✕</button>
                      </div>
                    </>
                  )}

                  {!isLoading && !isPending && ([mittag, abend] as const).map((e, i) => {
                    const slot = (i === 0 ? 'Mittag' : 'Abend') as WochenSlot
                    if (!e) return null
                    const key = `${tag}-${slot}`
                    const isEditing = editMealKey === key
                    const isAttendanceEdit = attendanceEditKey === key
                    const canEdit = !planConfirmed || currentUser === wochenchef
                    const canProposeChef = !shopDone
                    const slotAnwesend = getSlotAnwesend(tag, slot)
                    return (
                      <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <SlotPill slot={slot} />
                          <span
                            onClick={canProposeChef ? () => toggleEditMeal(key) : undefined}
                            style={{ fontSize: 11, color: '#555', cursor: canProposeChef ? 'pointer' : 'default', textDecoration: canProposeChef ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                          >Koch: {personNames[e.chef]}</span>
                          <span style={{ fontSize: 10, color: '#ddd' }}>·</span>
                          <span
                            onClick={canEdit ? () => setAttendanceEditKey(isAttendanceEdit ? null : key) : undefined}
                            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                          >Essen: {slotEssenLabel(tag, slot)}</span>
                          {hasPendingChefProposal(tag, slot) && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 5, padding: '1px 6px' }}>⏳ Koch-Vorschlag eingereicht</span>
                          )}
                        </div>
                        {isEditing && canProposeChef && (
                          <div style={{ padding: '4px 12px 8px', background: '#f9f9f9' }}>
                            {planConfirmed && currentUser !== wochenchef && (
                              <div style={{ fontSize: 10, color: '#92400E', padding: '2px 0 6px' }}>⏳ Vorschlag an {personNames[wochenchef]}</div>
                            )}
                            <ChefPicker current={e.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
                            {planConfirmed && currentUser === wochenchef && (() => {
                              const stockItems = [...freezerItems, ...pantryItems]
                              return (
                                <>
                                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                    <button onClick={() => replanSlot(tag, slot)} disabled={slotLoading !== null || dayLoading !== null}
                                      style={{ flex: 1, padding: '6px 4px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: (slotLoading !== null || dayLoading !== null) ? 'default' : 'pointer', fontSize: 11, color: slotLoading === key ? '#085041' : '#555', opacity: (slotLoading !== null && slotLoading !== key) ? 0.4 : 1 }}>
                                      {slotLoading === key ? '⏳…' : '↺ Rémy'}
                                    </button>
                                    <button onClick={() => { if (mealSubMode === 'manual') setMealSubMode(null); else { setMealSubMode('manual'); setManualDishInput('') } }}
                                      style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'manual' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'manual' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'manual' ? '#0F6E56' : '#555' }}>
                                      ✏️ Eigenes
                                    </button>
                                    <button onClick={() => setMealSubMode(prev => prev === 'pantry' ? null : 'pantry')}
                                      style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'pantry' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'pantry' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'pantry' ? '#0F6E56' : '#555' }}>
                                      ❄️ Vorrat
                                    </button>
                                  </div>
                                  {mealSubMode === 'manual' && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                      <input type="text" value={manualDishInput} onChange={ev => setManualDishInput(ev.target.value)}
                                        onKeyDown={ev => ev.key === 'Enter' && !!manualDishInput.trim() && applyActiveManualDish(tag, slot, manualDishInput)}
                                        placeholder="Gerichtsname…" autoFocus
                                        style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }} />
                                      <button onClick={() => applyActiveManualDish(tag, slot, manualDishInput)} disabled={!manualDishInput.trim()}
                                        style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 600, cursor: manualDishInput.trim() ? 'pointer' : 'default', opacity: manualDishInput.trim() ? 1 : 0.4 }}>✓</button>
                                    </div>
                                  )}
                                  {mealSubMode === 'pantry' && (stockItems.length === 0
                                    ? <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '4px 0', marginTop: 4 }}>Nichts im Vorrat</div>
                                    : <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                        {stockItems.map(item => (
                                          <button key={item.id} onClick={() => applyActiveStockItem(tag, slot, item.name, item.emoji)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid #eee', borderRadius: 6, background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                                            <span style={{ fontSize: 14 }}>{item.emoji}</span>
                                            <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{item.name}</span>
                                            <span style={{ fontSize: 10, color: '#bbb' }}>{item.menge}</span>
                                          </button>
                                        ))}
                                      </div>
                                  )}
                                  <button onClick={() => replanDay(tag)} disabled={dayLoading === tag || slotLoading !== null}
                                    style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 11, color: '#888', textAlign: 'left', width: '100%', marginTop: 4 }}>
                                    ↺ ganzer Tag neu planen
                                  </button>
                                </>
                              )
                            })()}
                          </div>
                        )}
                        {isAttendanceEdit && canEdit && (
                          <div style={{ padding: '6px 12px 8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, background: '#f9f9f9', borderTop: '1px solid #f0f0f0' }}>
                            <span style={{ fontSize: 11, color: '#888', width: '100%' }}>Wer ist dabei?</span>
                            {allChefIds.map(c => {
                              const on = slotAnwesend.includes(c)
                              const cc = CFG[c] ?? CFG.MA
                              return (
                                <button key={c} onClick={() => toggleSlotAttendance(tag, slot, c)}
                                  style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${on ? cc.c : '#ddd'}`, background: on ? cc.bg : 'white', color: on ? cc.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >{personNames[c] ?? c}</button>
                              )
                            })}
                            <button onClick={() => setAttendanceEditKey(null)} style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#888', fontSize: 11, cursor: 'pointer' }}>Fertig</button>
                          </div>
                        )}
                        <div
                          onClick={() => mealsData[e.gericht] ? setSelectedMealName(e.gericht) : undefined}
                          style={{ padding: '3px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: mealsData[e.gericht] ? 'pointer' : 'default' }}
                        >
                          <span style={{ fontSize: 18 }}>{e.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {e.gericht}{mealsData[e.gericht] ? <span style={{ fontSize: 10, color: '#bbb' }}>›</span> : null}
                              {(mealsData[e.gericht]?.ersetzteZutaten?.length ?? 0) > 0 && (
                                <span title={mealsData[e.gericht]!.ersetzteZutaten!.join(' · ')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default' }}>!</span>
                              )}
                              {planConfirmed && !mealsData[e.gericht] && (
                                <span title="Kein Rezept – fehlt in der Einkaufsliste" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#F59E0B', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default' }}>?</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#aaa' }}>{e.minuten} min</div>
                          </div>
                        </div>
                        <SlotWunschPanel
                          tag={tag} slot={slot} wishes={wishes} personNames={personNames} originalEntry={e}
                          isWochenchef={currentUser === wochenchef} planConfirmed={planConfirmed}
                          selectedAltId={chefAltSelection[`${tag}-${slot}`] ?? 'original'} checkedErgIds={chefErgaenzungIds}
                          onSelectAlt={(id) => setChefAltSelection(prev => ({ ...prev, [`${tag}-${slot}`]: id }))}
                          onToggleErg={(wishId) => setChefErgaenzungIds(prev => prev.includes(wishId) ? prev.filter(id => id !== wishId) : [...prev, wishId])}
                        />
                        <WishesSection
                          tag={tag} wishes={wishes} freezerItems={freezerItems} pantryItems={pantryItems}
                          personNames={personNames} planMittag={planMittag} lockedSlot={slot} showExisting={false}
                          canAdd={!shopDone && !wishDeadlinePassed} deadlineHint={wishDeadlineHint}
                          isOpen={wishFormKey === `${tag}-${slot}`} initialPerson={currentUser} familyPrompt={familyPrompt}
                          onOpen={() => openWishForm(tag, slot)} onClose={closeWishForm} onSubmitWish={handleWishSubmit} onRemove={removeWish}
                        />
                        {(() => {
                          const pKey = `${tag}-${slot}`
                          const isKochOpen = kochPanelKey === pKey
                          const portionen = restPortionen[pKey] ?? 1
                          return (
                            <div style={{ borderTop: '1px solid #f5f5f5' }}>
                              <button
                                onClick={() => toggleKochPanel(pKey)}
                                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 11, color: isKochOpen ? '#1D9E75' : '#bbb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                🍳 Fertig gekocht?
                              </button>
                              {isKochOpen && (
                                <div style={{ padding: '0 12px 12px', background: '#fafafa' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <span style={{ fontSize: 11, color: '#888' }}>Übrig geblieben?</span>
                                    <button
                                      onClick={() => setRestPortionen(prev => ({ ...prev, [pKey]: Math.max(1, (prev[pKey] ?? 1) - 1) }))}
                                      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >−</button>
                                    <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{portionen}</span>
                                    <button
                                      onClick={() => setRestPortionen(prev => ({ ...prev, [pKey]: (prev[pKey] ?? 1) + 1 }))}
                                      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >+</button>
                                    <span style={{ fontSize: 11, color: '#aaa' }}>Portion{portionen !== 1 ? 'en' : ''}</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <button
                                      onClick={() => handleMorgenEinplanen(tag, slot, e)}
                                      style={{ padding: '11px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', fontSize: 12, color: '#333', cursor: 'pointer', textAlign: 'left' }}
                                    >🍱 Morgen einplanen</button>
                                    <button
                                      onClick={() => handleEinfrieren(tag, slot, e)}
                                      style={{ padding: '11px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', fontSize: 12, color: '#333', cursor: 'pointer', textAlign: 'left' }}
                                    >❄️ Einfrieren</button>
                                    <button
                                      onClick={() => setKochPanelKey(null)}
                                      style={{ padding: '11px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', fontSize: 12, color: '#888', cursor: 'pointer', textAlign: 'left' }}
                                    >✕ Kein Rest</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
          {currentUser === wochenchef && !planConfirmed && (
            <button className="btn soft" style={{ marginTop: 8 }} onClick={goToPlan}>
              🔄 {weekPlan.length > 0 ? 'Neu planen' : 'Woche planen'}
            </button>
          )}

          {/* ── Nächste Woche ────────────────────────────────────────── */}
          {planConfirmed && (() => {
            const nextMonday = nextWeekStart ?? getNextMondayIso()
            const nwKw = getKW(nextMonday)
            const nwRange = getWeekRange(nextMonday)
            const nwChef = nextWeekData?.wochenchef
            const nwPlan = nextWeekData?.plan ?? []
            const nwMeals = nextWeekData?.mealsData ?? {}
            const nwConfirmed = nextWeekData?.planConfirmed ?? false
            const isNwChef = !!nwChef && currentUser === nwChef
            const nwDays = (planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)).filter(t => nwPlan.some(e => e.tag === t))
            const nwWishes = nextWeekData?.wishes ?? []
            const myNwWish = nwWishes.find(w => w.person === currentUser)
            const autoExpand = nwConfirmed || !!nwPendingPlan || nwPlanLoading
            const expanded = nwExpanded || autoExpand

            return (
              <div style={{ marginTop: 20, borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                {/* Compact header */}
                <button
                  onClick={() => setNwExpanded(v => !v)}
                  style={{ width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, background: nwConfirmed ? '#F0FAF5' : '#F8FAFC', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: nwConfirmed ? '#085041' : '#374151', flex: 1 }}>
                    📅 Nächste Woche · KW {nwKw} · {nwRange}
                  </span>
                  {nwChef && (
                    <span style={{ fontSize: 10, color: nwConfirmed ? '#0F6E56' : '#6B7280', background: nwConfirmed ? '#B2DFCC' : '#E5E7EB', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>
                      {nwConfirmed ? '✓ freigegeben' : '∘ nicht freigegeben'}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#aaa' }}>{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div style={{ borderTop: '1px solid #E5E7EB' }}>
                    {/* Wochenchef-Zeile */}
                    <div style={{ padding: '8px 12px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ fontSize: 11, color: '#888' }}>Wochenchef:</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: nwChef ? (CFG[nwChef]?.c ?? '#333') : '#bbb' }}>
                        {nwChef ? personNames[nwChef] : '— noch nicht festgelegt'}
                      </span>
                    </div>

                    {/* Loading */}
                    {nwPlanLoading && (
                      <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🐀</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#085041', marginBottom: 6 }}>Rémy plant die nächste Woche…</div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>Einen Moment bitte.</div>
                      </div>
                    )}

                    {/* Pending plan (Rémy's suggestion) */}
                    {!nwPlanLoading && nwPendingPlan && (
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#085041', marginBottom: 8 }}>Rémy schlägt vor:</div>
                        {(planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)).map(tag => {
                          const mittag = nwPendingPlan.find(e => e.tag === tag && e.slot === 'Mittag')
                          const abend = nwPendingPlan.find(e => e.tag === tag && e.slot === 'Abend')
                          if (!mittag && !abend) return null
                          return (
                            <div key={tag} style={{ borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 8, overflow: 'hidden' }}>
                              <div style={{ padding: '5px 10px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>{tag}</div>
                              {[mittag, abend].filter(Boolean).map(e => {
                                const key = `nwp-${e!.tag}-${e!.slot}`
                                return (
                                  <div key={key} style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f0f0f0' }}>
                                    <SlotPill slot={e!.slot} />
                                    {nwSlotLoading === `${e!.tag}-${e!.slot}` ? (
                                      <span style={{ fontSize: 11, color: '#aaa' }}>🐀 wird neu geplant…</span>
                                    ) : (
                                      <>
                                        <span style={{ fontSize: 16 }}>{e!.emoji}</span>
                                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#111' }}>{e!.gericht}</span>
                                        <span style={{ fontSize: 10, color: '#bbb' }}>{e!.minuten} min</span>
                                        <button onClick={() => replanNwPendingSlot(e!.tag, e!.slot)} disabled={nwSlotLoading !== null}
                                          style={{ width: 30, height: 30, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#ccc', opacity: nwSlotLoading !== null ? 0.3 : 1 }}>↺</button>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn primary" onClick={acceptNwPlan} disabled={nwSaving} style={{ fontSize: 12 }}>
                            {nwSaving ? '⏳…' : '✅ Plan übernehmen'}
                          </button>
                          <button onClick={() => { setNwPendingPlan(null); setNwPendingMeals({}) }} style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'white', fontSize: 12, cursor: 'pointer', color: '#666' }}>✕</button>
                        </div>
                      </div>
                    )}

                    {/* Plan saved, not yet confirmed */}
                    {!nwPlanLoading && !nwPendingPlan && nwPlan.length > 0 && !nwConfirmed && (
                      <div style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Plan vorhanden – noch nicht freigegeben</div>
                        {(planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)).map(tag => {
                          const mittag = nwPlan.find(e => e.tag === tag && e.slot === 'Mittag')
                          const abend = nwPlan.find(e => e.tag === tag && e.slot === 'Abend')
                          if (!mittag && !abend) return null
                          return (
                            <div key={tag} style={{ borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 6, overflow: 'hidden' }}>
                              <div style={{ padding: '5px 10px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>{tag}</div>
                              {[mittag, abend].filter(Boolean).map(e => (
                                <div key={`${e!.slot}`} style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f5f5f5' }}>
                                  <SlotPill slot={e!.slot} />
                                  <span style={{ fontSize: 15 }}>{e!.emoji}</span>
                                  <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{e!.gericht}</span>
                                  <span style={{ fontSize: 10, color: '#bbb' }}>{e!.minuten} min</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          {isNwChef && (
                            <button className="btn primary" onClick={confirmNwWeek} disabled={nwSaving} style={{ fontSize: 12 }}>
                              {nwSaving ? '⏳…' : '✅ Woche freigeben'}
                            </button>
                          )}
                          {isNwChef && (
                            <button onClick={generateNwPlan} disabled={nwPlanLoading} style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'white', fontSize: 12, cursor: 'pointer', color: '#555' }}>
                              🔄 Neu planen
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* After confirmation: full day view */}
                    {!nwPlanLoading && !nwPendingPlan && nwConfirmed && nwDays.map(tag => {
                      const mittag = nwPlan.find(e => e.tag === tag && e.slot === 'Mittag')
                      const abend = nwPlan.find(e => e.tag === tag && e.slot === 'Abend')
                      if (!mittag && !abend) return null
                      return (
                        <div key={tag} style={{ borderTop: '1px solid #f0f0f0' }}>
                          <div style={{ padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>{tag}</span>
                          </div>
                          {([mittag, abend] as const).map(e => {
                            if (!e) return null
                            const slot = e.slot
                            const nwKey = `nw-${tag}-${slot}`
                            const isNwEditing = nwEditMealKey === nwKey
                            return (
                              <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
                                <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <SlotPill slot={slot} />
                                  <span
                                    onClick={isNwChef ? () => { setNwEditMealKey(isNwEditing ? null : nwKey); setNwMealSubMode(null); setNwManualDish('') } : undefined}
                                    style={{ fontSize: 11, color: '#555', cursor: isNwChef ? 'pointer' : 'default', textDecoration: isNwChef ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                                  >Koch: {personNames[e.chef]}</span>
                                </div>
                                {isNwEditing && isNwChef && (() => {
                                  const stockItems = [...freezerItems, ...pantryItems]
                                  return (
                                    <div style={{ padding: '4px 12px 8px', background: '#f9f9f9' }}>
                                      <ChefPicker current={e.chef} onSelect={chef => { changeNwChef(tag, slot, chef); setNwEditMealKey(null) }} personNames={personNames} members={members} />
                                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                        <button onClick={() => replanNwSlot(tag, slot)} disabled={nwSlotLoading !== null}
                                          style={{ flex: 1, padding: '6px 4px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: nwSlotLoading !== null ? 'default' : 'pointer', fontSize: 11, color: nwSlotLoading === `${tag}-${slot}` ? '#085041' : '#555', opacity: (nwSlotLoading !== null && nwSlotLoading !== `${tag}-${slot}`) ? 0.4 : 1 }}>
                                          {nwSlotLoading === `${tag}-${slot}` ? '⏳…' : '↺ Rémy'}
                                        </button>
                                        <button onClick={() => { setNwMealSubMode(m => m === 'manual' ? null : 'manual'); setNwManualDish('') }}
                                          style={{ flex: 1, padding: '6px 4px', border: `1px solid ${nwMealSubMode === 'manual' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: nwMealSubMode === 'manual' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: nwMealSubMode === 'manual' ? '#0F6E56' : '#555' }}>
                                          ✏️ Eigenes
                                        </button>
                                        <button onClick={() => setNwMealSubMode(m => m === 'pantry' ? null : 'pantry')}
                                          style={{ flex: 1, padding: '6px 4px', border: `1px solid ${nwMealSubMode === 'pantry' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: nwMealSubMode === 'pantry' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: nwMealSubMode === 'pantry' ? '#0F6E56' : '#555' }}>
                                          ❄️ Vorrat
                                        </button>
                                      </div>
                                      {nwMealSubMode === 'manual' && (
                                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                          <input type="text" value={nwManualDish} onChange={ev => setNwManualDish(ev.target.value)}
                                            onKeyDown={ev => ev.key === 'Enter' && applyNwManualDish(tag, slot, nwManualDish)}
                                            placeholder="Gerichtsname…" autoFocus
                                            style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }} />
                                          <button onClick={() => applyNwManualDish(tag, slot, nwManualDish)} disabled={!nwManualDish.trim()}
                                            style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 600, cursor: nwManualDish.trim() ? 'pointer' : 'default', opacity: nwManualDish.trim() ? 1 : 0.4 }}>✓</button>
                                        </div>
                                      )}
                                      {nwMealSubMode === 'pantry' && (stockItems.length === 0
                                        ? <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '4px 0', marginTop: 4 }}>Nichts im Vorrat</div>
                                        : <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                            {stockItems.map(item => (
                                              <button key={item.id} onClick={() => applyNwStockItem(tag, slot, item.name, item.emoji)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid #eee', borderRadius: 6, background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                                                <span style={{ fontSize: 14 }}>{item.emoji}</span>
                                                <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{item.name}</span>
                                                <span style={{ fontSize: 10, color: '#bbb' }}>{item.menge}</span>
                                              </button>
                                            ))}
                                          </div>
                                      )}
                                    </div>
                                  )
                                })()}
                                <div style={{ padding: '3px 12px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 18 }}>{e.emoji}</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{e.gericht}</div>
                                    <div style={{ fontSize: 11, color: '#aaa' }}>{e.minuten} min</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Footer actions */}
                    <div style={{ padding: '8px 12px 10px', borderTop: nwConfirmed || nwPlan.length > 0 ? '1px solid #f0f0f0' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Generate plan (when no plan yet) */}
                      {!nwPlanLoading && !nwPendingPlan && nwPlan.length === 0 && isNwChef && (
                        <button onClick={generateNwPlan}
                          style={{ padding: '9px 12px', border: 'none', borderRadius: 8, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          🐀 Rémy fragen – Woche planen
                        </button>
                      )}

                      {/* Wish input (for non-nwChef or also nwChef) */}
                      {!nwPendingPlan && (
                        <div>
                          {myNwWish ? (
                            <div style={{ fontSize: 11, color: '#0F6E56', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>✓ Dein Wunsch: „{myNwWish.text}"</span>
                              <button onClick={() => onNextWeekDataChange?.({ wishes: nwWishes.filter(x => x.id !== myNwWish.id) }, nextMonday)}
                                style={{ border: 'none', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: 13, padding: 0 }}>×</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input value={nextWeekWishInput} onChange={ev => setNextWeekWishInput(ev.target.value)}
                                onKeyDown={ev => ev.key === 'Enter' && submitNextWeekWish()}
                                placeholder="Wunsch für nächste Woche..."
                                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 9px', fontSize: 12, outline: 'none', background: 'white' }} />
                              <button onClick={submitNextWeekWish} disabled={!nextWeekWishInput.trim() || nextWeekWishSaving}
                                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: nextWeekWishInput.trim() ? '#1D9E75' : '#ddd', color: 'white', fontSize: 12, cursor: nextWeekWishInput.trim() ? 'pointer' : 'default' }}>
                                {nextWeekWishSaving ? '…' : '+ Wunsch'}
                              </button>
                            </div>
                          )}
                          {isNwChef && nwWishes.length > 0 && (
                            <div style={{ marginTop: 6, padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                              <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>Wünsche der Familie:</div>
                              {nwWishes.map(w => (
                                <div key={w.id} style={{ fontSize: 11, color: '#444', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                  <span style={{ fontWeight: 700, color: CFG[w.person as Chef]?.c ?? '#333' }}>{personNames[w.person as Chef]}:</span>
                                  <span>„{w.text}"</span>
                                  <button onClick={() => onNextWeekDataChange?.({ wishes: nwWishes.filter(x => x.id !== w.id) }, nextMonday)}
                                    style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  // ── Home view ─────────────────────────────────────────────────────────────
  const todayMittag = getSlot(weekPlan, today, 'Mittag')
  const todayAbend = getSlot(weekPlan, today, 'Abend')

  function renderHomeSlot(tag: string, slot: WochenSlot, entry: WeekPlanEntry | null) {
    if (!entry) {
      return (
        <div key={slot} style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlotPill slot={slot} />
          <span style={{ fontSize: 12, color: '#bbb' }}>noch nicht geplant</span>
        </div>
      )
    }
    const key = `${tag}-${slot}`
    const isEditing = editMealKey === key
    const isAttendanceEdit = attendanceEditKey === key
    const hasRecipe = !!mealsData[entry.gericht]
    const canEdit = !planConfirmed || currentUser === wochenchef
    const canProposeChef = !shopDone
    const slotAnwesend = getSlotAnwesend(tag, slot)
    return (
      <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
        <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SlotPill slot={slot} />
          <span
            onClick={canProposeChef ? () => toggleEditMeal(key) : undefined}
            style={{ fontSize: 11, color: '#555', cursor: canProposeChef ? 'pointer' : 'default', textDecoration: canProposeChef ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
          >Koch: {personNames[entry.chef]}</span>
          <span style={{ fontSize: 10, color: '#ddd' }}>·</span>
          <span
            onClick={canEdit ? () => setAttendanceEditKey(isAttendanceEdit ? null : key) : undefined}
            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
          >Essen: {slotEssenLabel(tag, slot)}</span>
          {hasPendingChefProposal(tag, slot) && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 5, padding: '1px 6px' }}>⏳ Koch-Vorschlag eingereicht</span>
          )}
        </div>
        {isEditing && canProposeChef && (
          <div style={{ padding: '4px 12px 8px', background: '#f9f9f9' }}>
            {planConfirmed && currentUser !== wochenchef && (
              <div style={{ fontSize: 10, color: '#92400E', padding: '2px 0 6px' }}>⏳ Vorschlag an {personNames[wochenchef]}</div>
            )}
            <ChefPicker current={entry.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
            {planConfirmed && currentUser === wochenchef && (() => {
              const stockItems = [...freezerItems, ...pantryItems]
              return (
                <>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={() => replanSlot(tag, slot)} disabled={slotLoading !== null || dayLoading !== null}
                      style={{ flex: 1, padding: '6px 4px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: (slotLoading !== null || dayLoading !== null) ? 'default' : 'pointer', fontSize: 11, color: slotLoading === key ? '#085041' : '#555', opacity: (slotLoading !== null && slotLoading !== key) ? 0.4 : 1 }}>
                      {slotLoading === key ? '⏳…' : '↺ Rémy'}
                    </button>
                    <button onClick={() => { if (mealSubMode === 'manual') setMealSubMode(null); else { setMealSubMode('manual'); setManualDishInput('') } }}
                      style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'manual' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'manual' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'manual' ? '#0F6E56' : '#555' }}>
                      ✏️ Eigenes
                    </button>
                    <button onClick={() => setMealSubMode(prev => prev === 'pantry' ? null : 'pantry')}
                      style={{ flex: 1, padding: '6px 4px', border: `1px solid ${mealSubMode === 'pantry' ? '#1D9E75' : '#ddd'}`, borderRadius: 8, background: mealSubMode === 'pantry' ? '#E1F5EE' : 'white', cursor: 'pointer', fontSize: 11, color: mealSubMode === 'pantry' ? '#0F6E56' : '#555' }}>
                      ❄️ Vorrat
                    </button>
                  </div>
                  {mealSubMode === 'manual' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input type="text" value={manualDishInput} onChange={ev => setManualDishInput(ev.target.value)}
                        onKeyDown={ev => ev.key === 'Enter' && !!manualDishInput.trim() && applyActiveManualDish(tag, slot, manualDishInput)}
                        placeholder="Gerichtsname…" autoFocus
                        style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }} />
                      <button onClick={() => applyActiveManualDish(tag, slot, manualDishInput)} disabled={!manualDishInput.trim()}
                        style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 600, cursor: manualDishInput.trim() ? 'pointer' : 'default', opacity: manualDishInput.trim() ? 1 : 0.4 }}>✓</button>
                    </div>
                  )}
                  {mealSubMode === 'pantry' && (stockItems.length === 0
                    ? <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '4px 0', marginTop: 4 }}>Nichts im Vorrat</div>
                    : <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                        {stockItems.map(item => (
                          <button key={item.id} onClick={() => applyActiveStockItem(tag, slot, item.name, item.emoji)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid #eee', borderRadius: 6, background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 14 }}>{item.emoji}</span>
                            <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{item.name}</span>
                            <span style={{ fontSize: 10, color: '#bbb' }}>{item.menge}</span>
                          </button>
                        ))}
                      </div>
                  )}
                  <button onClick={() => replanDay(tag)} disabled={dayLoading === tag || slotLoading !== null}
                    style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 11, color: '#888', textAlign: 'left', width: '100%', marginTop: 4 }}>
                    ↺ ganzer Tag neu planen
                  </button>
                </>
              )
            })()}
          </div>
        )}
        {isAttendanceEdit && canEdit && (
          <div style={{ padding: '6px 12px 8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, background: '#f9f9f9', borderTop: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 11, color: '#888', width: '100%' }}>Wer ist dabei?</span>
            {allChefIds.map(c => {
              const on = slotAnwesend.includes(c)
              const cc = CFG[c] ?? CFG.MA
              return (
                <button key={c} onClick={() => toggleSlotAttendance(tag, slot, c)}
                  style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${on ? cc.c : '#ddd'}`, background: on ? cc.bg : 'white', color: on ? cc.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >{personNames[c] ?? c}</button>
              )
            })}
            <button onClick={() => setAttendanceEditKey(null)} style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'white', color: '#888', fontSize: 11, cursor: 'pointer' }}>Fertig</button>
          </div>
        )}
        <div
          onClick={hasRecipe ? () => setSelectedMealName(entry.gericht) : undefined}
          style={{ padding: '3px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: hasRecipe ? 'pointer' : 'default' }}
        >
          <span style={{ fontSize: 18 }}>{entry.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
              {entry.gericht}{hasRecipe ? <span style={{ fontSize: 10, color: '#bbb' }}>›</span> : null}
              {(mealsData[entry.gericht]?.ersetzteZutaten?.length ?? 0) > 0 && (
                <span title={mealsData[entry.gericht]!.ersetzteZutaten!.join(' · ')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default' }}>!</span>
              )}
              {planConfirmed && !mealsData[entry.gericht] && (
                <span title="Kein Rezept – fehlt in der Einkaufsliste" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#F59E0B', color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default' }}>?</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{entry.minuten} min</div>
          </div>
        </div>
        <WishesSection
          tag={tag} wishes={wishes} freezerItems={freezerItems} pantryItems={pantryItems}
          personNames={personNames} planMittag={planMittag} lockedSlot={slot}
          canAdd={!shopDone && !wishDeadlinePassed} deadlineHint={wishDeadlineHint}
          isOpen={wishFormKey === `${tag}-${slot}`} initialPerson={currentUser} familyPrompt={familyPrompt}
          onOpen={() => openWishForm(tag, slot)} onClose={closeWishForm} onSubmitWish={handleWishSubmit} onRemove={removeWish}
        />
      </div>
    )
  }

  if (weekPlan.length === 0) {
    return (
      <div className="screen active">
        <div className="topbar"><h1>🍽 FamilyPlate</h1></div>
        <div className="content">
          <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🐀</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Rémy plant eure Woche in Sekunden</div>
          </div>

          {/* Wochenchef-Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F0FAF5', borderRadius: 12, marginBottom: 14, border: '1px solid #B2DFCC' }}>
            <span style={{ fontSize: 22 }}>👩‍🍳</span>
            <div>
              <div style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>Wochenchef diese Woche</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{personNames[wochenchef]}</div>
            </div>
          </div>

          {/* Karte 1: Anwesenheit (vor dem Planen) */}
          <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#1D9E75', color: 'white', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Anwesenheit eintragen</span>
              <span style={{ fontSize: 10, color: '#6B7280', background: '#F3F4F6', borderRadius: 10, padding: '2px 8px', marginLeft: 2 }}>empfohlen</span>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                Wer ist wann dabei? Rémy berücksichtigt das beim Planen.
              </div>
              <button className="btn primary" onClick={() => setView('attendance')}>
                👥 Anwesenheit eintragen →
              </button>
            </div>
          </div>

          {/* Karte 2: Wochenplan erstellen */}
          <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#1D9E75', color: 'white', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Wochenplan erstellen</span>
            </div>
            <div style={{ padding: '10px 14px' }}>
              {currentUser !== wochenchef && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                  Wochenchef: <strong style={{ color: '#555' }}>{personNames[wochenchef]}</strong>
                </div>
              )}
              <button className="btn primary" onClick={goToPlan}>
                🐀 Woche planen
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen active" style={{ position: 'relative' }}>
      {selectedMealName && (
        <RecipeModal name={selectedMealName} rezept={mealsData[selectedMealName] ?? null} onClose={() => setSelectedMealName(null)} />
      )}
      <div className="topbar"><h1>🍽 FamilyPlate</h1></div>
      <div className="content">
        {renderWochenchefDecisions()}
        {vorratHinweis && currentUser === wochenchef && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>📦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>Speisekammer-Vorräte prüfen</div>
              <div style={{ fontSize: 11, color: '#555' }}>Rémy hat Speisekammer-Artikel eingeplant. Bitte im Vorräte-Tab die verbrauchten Artikel entfernen.</div>
            </div>
            <button onClick={() => setVorratHinweis(false)} style={{ border: 'none', background: 'none', color: '#bbb', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}
        {planConfirmed && (
          <div style={{ background: '#F0FAF5', border: '1px solid #B2DFCC', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            {currentUser !== wochenchef ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56', marginBottom: 3 }}>
                  Hallo {personNames[currentUser]}! 👋
                </div>
                <div style={{ fontSize: 12, color: '#444' }}>
                  {personNames[wochenchef]} hat die Woche geplant – trag gerne deine Wünsche ein.
                  {shoppingDays.length > 0 && (
                    <> Einkauf ist am <strong>{shoppingDays.map(d => shoppingPersons[d] ? `${d} (${personNames[shoppingPersons[d]]})` : d).join(' und ')}</strong>.</>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#0F6E56' }}>
                ✅ Woche bestätigt{weekStart ? ` · KW ${getKW(weekStart)}` : ''}
                {shoppingDays.length > 0 && (
                  <> · Einkauf am <strong>{shoppingDays.map(d => shoppingPersons[d] ? `${d} (${personNames[shoppingPersons[d]]})` : d).join(' und ')}</strong></>
                )}
              </div>
            )}
          </div>
        )}

        {/* Nächste Woche vorbereiten */}
        {planConfirmed && (() => {
          const nextMonday = nextWeekStart ?? getNextMondayIso()
          const kw = getKW(nextMonday)
          const dateRange = getWeekRange(nextMonday)
          const nextChef = nextWeekData?.wochenchef
          const currentMonday = getMondayIso()
          const isCurrentWeekPast = weekStart != null && weekStart < currentMonday
          const nextWishes = nextWeekData?.wishes ?? []
          const myWish = nextWishes.find(w => w.person === currentUser)
          return (
            <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              {/* Header */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                📅 Nächste Woche · KW {kw} · {dateRange}
              </div>

              {/* Wochenchef-Auswahl (nur Wochenchef) */}
              {currentUser === wochenchef ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Wochenchef festlegen:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {activeMembers.map(m => {
                      const isSelected = nextChef === m.id
                      const isSuggested = !nextChef && m.id === suggestedNextChef
                      const cc = CFG[m.id as Chef] ?? CFG.MA
                      return (
                        <button key={m.id}
                          onClick={() => onNextWeekDataChange?.({ wochenchef: m.id as Chef }, nextMonday)}
                          style={{ flex: 1, padding: '7px 4px', borderRadius: 8, textAlign: 'center', cursor: 'pointer',
                            border: `2px solid ${isSelected ? cc.c : isSuggested ? '#FCD34D' : '#e5e7eb'}`,
                            background: isSelected ? cc.bg : isSuggested ? '#FFFBEB' : 'white' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>{m.name}</div>
                          <div style={{ fontSize: 9, marginTop: 2, color: isSelected ? cc.c : isSuggested ? '#92400E' : 'transparent' }}>
                            {isSelected ? '✓' : isSuggested ? '★ Empfehlung' : '·'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                  Wochenchef: <strong>{nextChef ? personNames[nextChef] : '— noch nicht festgelegt'}</strong>
                </div>
              )}

              {/* Alle Wünsche (für Wochenchef) */}
              {currentUser === wochenchef && nextWishes.length > 0 && (
                <div style={{ marginBottom: 8, padding: '7px 10px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Wünsche der Familie:</div>
                  {nextWishes.map(w => {
                    const cc = CFG[w.person as Chef] ?? CFG.MA
                    return (
                      <div key={w.id} style={{ fontSize: 11, color: '#444', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: cc.c }}>{personNames[w.person as Chef]}:</span>
                        <span>„{w.text}"</span>
                        <button onClick={() => onNextWeekDataChange?.({ wishes: nextWishes.filter(x => x.id !== w.id) }, nextMonday)}
                          style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Wunsch-Eingabe */}
              {myWish ? (
                <div style={{ fontSize: 11, color: '#0F6E56', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span>✓ Dein Wunsch: „{myWish.text}"</span>
                  <button onClick={() => onNextWeekDataChange?.({ wishes: nextWishes.filter(x => x.id !== myWish.id) }, nextMonday)}
                    style={{ border: 'none', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    value={nextWeekWishInput}
                    onChange={e => setNextWeekWishInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitNextWeekWish()}
                    placeholder="Wunsch für nächste Woche..."
                    style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 9px', fontSize: 12, outline: 'none', background: 'white' }}
                  />
                  <button onClick={submitNextWeekWish} disabled={!nextWeekWishInput.trim() || nextWeekWishSaving}
                    style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: nextWeekWishInput.trim() ? '#1D9E75' : '#ddd', color: 'white', fontSize: 12, cursor: nextWeekWishInput.trim() ? 'pointer' : 'default' }}>
                    {nextWeekWishSaving ? '…' : '+ Eintragen'}
                  </button>
                </div>
              )}

              {/* Neue Woche starten */}
              {isCurrentWeekPast && (
                <button onClick={onActivateNextWeek}
                  style={{ width: '100%', padding: '9px', border: 'none', borderRadius: 9, background: '#0C447C', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  🗓 Neue Woche starten
                </button>
              )}
            </div>
          )
        })()}
        <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#f0faf5', borderBottom: '1px solid #e0f0e8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#085041' }}>Heute · {today}</span>
            <span className="pill today">Heute</span>
          </div>
          {planMittag && renderHomeSlot(today, 'Mittag', todayMittag)}
          {renderHomeSlot(today, 'Abend', todayAbend)}
        </div>

        {nextDays.map(tag => {
          const nextMittag = getSlot(weekPlan, tag, 'Mittag')
          const nextAbend = getSlot(weekPlan, tag, 'Abend')
          return (
            <div key={tag} style={{ borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>{tag}</span>
              </div>
              {planMittag && renderHomeSlot(tag, 'Mittag', nextMittag)}
              {renderHomeSlot(tag, 'Abend', nextAbend)}
            </div>
          )
        })}

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => setView('week')}
            style={{ border: 'none', background: 'none', color: '#1D9E75', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            📋 Ganze Woche ansehen →
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={() => setView('attendance')}
            style={{ border: 'none', background: 'none', color: '#888', fontSize: 12, cursor: 'pointer' }}
          >
            👥 Anwesenheit
          </button>
        </div>
      </div>
      {currentUser === wochenchef && !planConfirmed && (
        <div style={{ padding: '0 20px 16px' }}>
          <button className="btn soft" onClick={goToPlan}>🔄 Neu planen</button>
        </div>
      )}
    </div>
  )
}

function SlotPill({ slot }: { slot: WochenSlot }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
      background: slot === 'Mittag' ? '#FEF3C7' : '#FFF1EE',
      color: slot === 'Mittag' ? '#92400E' : '#C2410C',
    }}>
      {slot}
    </span>
  )
}

function ChefPicker({ current, onSelect, personNames, members }: { current: Chef; onSelect: (c: Chef) => void; personNames: Record<Chef, string>; members: import('../lib/state').FamilyMember[] }) {
  return (
    <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 4 }}>
      {(['PA', 'MA', 'TI'] as Chef[]).map(p => {
        const c = CFG[p]
        const active = current === p
        const stat = members.find(m => m.id === p)?.chefStat
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            style={{ padding: '4px 10px 5px', borderRadius: 8, border: '1px solid', borderColor: active ? c.c : '#ddd', background: active ? c.bg : 'white', color: active ? c.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
          >
            <span>{p} · {personNames[p]}</span>
            {stat && <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{stat.count}×</span>}
          </button>
        )
      })}
    </div>
  )
}

type WishMode = 'ergaenzung' | 'alternative' | 'vorrat' | 'remy'

interface WishesSectionProps {
  tag: string
  wishes: Wish[]
  freezerItems: FreezerItem[]
  pantryItems: PantryItem[]
  personNames: Record<Chef, string>
  planMittag: boolean
  lockedSlot?: WochenSlot
  showExisting?: boolean
  canAdd?: boolean
  deadlineHint?: string
  isOpen: boolean
  initialPerson: Chef
  familyPrompt: string
  onOpen: () => void
  onClose: () => void
  onSubmitWish: (wish: Wish) => void
  onRemove: (id: string) => void
}

function WishesSection({
  tag, wishes, freezerItems, pantryItems, personNames, planMittag,
  lockedSlot, showExisting = true, canAdd = true, deadlineHint, isOpen, initialPerson, familyPrompt,
  onOpen, onClose, onSubmitWish, onRemove,
}: WishesSectionProps) {
  const dayWishes = wishes.filter(w => w.tag === tag && (!lockedSlot || w.slot === lockedSlot))

  const [wishPerson, setWishPerson] = useState<Chef>(initialPerson)
  const [wishSlot, setWishSlot] = useState<WochenSlot>(lockedSlot ?? 'Abend')
  const [wishMode, setWishMode] = useState<WishMode>('ergaenzung')
  const [wishText, setWishText] = useState('')
  const [wishDish, setWishDish] = useState<{ name: string; emoji: string } | null>(null)
  const [remySuggestions, setRemySuggestions] = useState<RemyVorschlag[]>([])
  const [remyLoading, setRemyLoading] = useState(false)

  function handleOpen() {
    setWishPerson(initialPerson)
    setWishSlot(lockedSlot ?? 'Abend')
    setWishMode('ergaenzung')
    setWishText('')
    setWishDish(null)
    setRemySuggestions([])
    onOpen()
  }

  function switchMode(mode: WishMode) {
    setWishMode(mode)
    setWishText('')
    setWishDish(null)
    setRemySuggestions([])
    if (mode === 'remy') fetchRemy(mode)
  }

  async function fetchRemy(mode: WishMode) {
    if (mode !== 'remy') return
    setRemyLoading(true)
    try {
      const results = await getRemySuggestions({
        wishes: wishes.filter(w => w.tag === tag && w.slot === wishSlot),
        zustimmungen: [],
        choDay: tag,
        choSlot: wishSlot,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        familyPrompt,
      })
      setRemySuggestions(results)
    } catch {
      setRemySuggestions([])
    }
    setRemyLoading(false)
  }

  function handleSlotChange(s: WochenSlot) {
    setWishSlot(s)
    if (wishMode === 'remy') {
      setRemySuggestions([])
      fetchRemy('remy')
    }
  }

  function handleSubmit() {
    const base = { id: crypto.randomUUID(), person: wishPerson, tag, slot: wishSlot }
    let wish: Wish
    if (wishMode === 'ergaenzung') {
      if (!wishText.trim()) return
      wish = { ...base, type: 'ergaenzung', text: wishText.trim() }
    } else {
      if (!wishDish && !wishText.trim()) return
      wish = wishDish
        ? { ...base, type: 'alternative', dishName: wishDish.name, emoji: wishDish.emoji }
        : { ...base, type: 'alternative', dishName: wishText.trim(), emoji: '🍽️' }
    }
    onSubmitWish(wish)
    setWishText('')
    setWishDish(null)
    setWishMode('ergaenzung')
    setRemySuggestions([])
  }

  const stockItems = [...freezerItems, ...pantryItems]
  const canSubmit = wishMode === 'ergaenzung'
    ? wishText.trim().length > 0
    : wishDish !== null || wishText.trim().length > 0

  return (
    <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {showExisting && dayWishes.map(w => {
          const c = CFG[w.person] ?? CFG.MA
          const slotIcon = w.slot === 'Mittag' ? '🌞' : '🌙'
          const typeLabel = w.type === 'alternative' ? '🔄 ' : ''
          const content = w.type === 'ergaenzung' ? w.text : `${w.emoji} ${w.dishName}`
          return (
            <span key={w.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: c.bg, color: c.c, borderRadius: 8, padding: '2px 6px', fontSize: 11 }}>
              <span style={{ fontWeight: 700 }}>{personNames[w.person]}</span>
              <span style={{ opacity: 0.6 }}>{slotIcon}</span>
              <span>{typeLabel}{content}</span>
              <button onClick={() => onRemove(w.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: '0 0 0 2px', lineHeight: 1 }}>×</button>
            </span>
          )
        })}
        {!isOpen && canAdd && (
          <button
            onClick={handleOpen}
            style={{ fontSize: 11, color: '#bbb', border: '1px dashed #ddd', borderRadius: 8, padding: '2px 8px', background: 'none', cursor: 'pointer' }}
          >
            + Änderungswunsch
          </button>
        )}
        {!isOpen && !canAdd && deadlineHint && (
          <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>{deadlineHint}</span>
        )}
      </div>

      {isOpen && (
        <div style={{ marginTop: 8, padding: 10, background: '#f9f9f9', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Person */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['PA', 'MA', 'TI'] as Chef[]).map(p => {
              const c = CFG[p]
              const active = wishPerson === p
              return (
                <button key={p} onClick={() => setWishPerson(p)}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid', borderColor: active ? c.c : '#ddd', background: active ? c.bg : 'white', color: active ? c.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  {personNames[p]}
                </button>
              )
            })}
          </div>

          {/* Slot */}
          {planMittag && !lockedSlot && (
            <div style={{ display: 'flex', gap: 4 }}>
              {(['Mittag', 'Abend'] as const).map(s => (
                <button key={s} onClick={() => handleSlotChange(s)}
                  style={{ fontSize: 11, padding: '2px 10px', border: '1px solid', borderColor: wishSlot === s ? '#1D9E75' : '#ddd', borderRadius: 6, background: wishSlot === s ? '#E1F5EE' : 'white', color: wishSlot === s ? '#0F6E56' : '#aaa', cursor: 'pointer' }}
                >
                  {s === 'Mittag' ? '🌞 Mittag' : '🌙 Abend'}
                </button>
              ))}
            </div>
          )}

          {/* Modus */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {([
              { mode: 'ergaenzung', label: '➕ Zutat hinzufügen' },
              { mode: 'alternative', label: '🔄 Anderes Gericht' },
              { mode: 'vorrat', label: '❄️ Aus Vorrat' },
              { mode: 'remy', label: '🐀 Rémy fragen' },
            ] as { mode: WishMode; label: string }[]).map(({ mode, label }) => (
              <button key={mode} onClick={() => switchMode(mode)}
                style={{ fontSize: 11, padding: '2px 10px', border: '1px solid', borderColor: wishMode === mode ? '#1D9E75' : '#ddd', borderRadius: 6, background: wishMode === mode ? '#E1F5EE' : 'white', color: wishMode === mode ? '#0F6E56' : '#aaa', cursor: 'pointer' }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#888', marginTop: -2 }}>
            {wishMode === 'ergaenzung' && 'Zutat ergänzen oder weglassen – z.B. „kein Käse", „Erbsen dazu"'}
            {wishMode === 'alternative' && 'Ein komplett anderes Gericht vorschlagen – ersetzt das geplante Gericht'}
            {wishMode === 'vorrat' && 'Ein Gericht aus Gefriertruhe oder Speisekammer wählen'}
            {wishMode === 'remy' && 'Rémy macht Vorschläge passend zu euren Vorlieben'}
          </div>

          {/* Ergänzung */}
          {wishMode === 'ergaenzung' && (
            <input
              type="text" value={wishText}
              onChange={e => setWishText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
              placeholder="z.B. Erbsen dazu, kein Käse bitte…"
              autoFocus
              style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }}
            />
          )}

          {/* Eigenes Gericht */}
          {wishMode === 'alternative' && (
            <input
              type="text" value={wishText}
              onChange={e => { setWishText(e.target.value); setWishDish(null) }}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
              placeholder="Gerichtsname eingeben…"
              autoFocus
              style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }}
            />
          )}

          {/* Aus Vorrat */}
          {wishMode === 'vorrat' && (
            stockItems.length === 0 ? (
              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '6px 0' }}>Nichts im Vorrat eingetragen</div>
            ) : (
              <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {stockItems.map(item => {
                  const selected = wishDish?.name === item.name
                  return (
                    <button key={item.id}
                      onClick={() => setWishDish(selected ? null : { name: item.name, emoji: item.emoji })}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid', borderColor: selected ? '#1D9E75' : '#eee', borderRadius: 6, background: selected ? '#E1F5EE' : 'white', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ fontSize: 15 }}>{item.emoji}</span>
                      <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{item.name}</span>
                      <span style={{ fontSize: 10, color: '#bbb' }}>{item.menge}</span>
                    </button>
                  )
                })}
              </div>
            )
          )}

          {/* Rémy-Vorschläge */}
          {wishMode === 'remy' && (
            remyLoading ? (
              <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: '#aaa' }}>🐀 Rémy denkt nach…</div>
            ) : remySuggestions.length === 0 ? (
              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '6px 0' }}>
                Keine Vorschläge – bitte erneut versuchen
                <button onClick={() => fetchRemy('remy')} style={{ display: 'block', margin: '6px auto 0', fontSize: 11, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer' }}>↺ Nochmal</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {remySuggestions.map((s, i) => {
                  const selected = wishDish?.name === s.name
                  return (
                    <button key={i}
                      onClick={() => setWishDish(selected ? null : { name: s.name, emoji: s.emoji })}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid', borderColor: selected ? '#1D9E75' : '#eee', borderRadius: 8, background: selected ? '#E1F5EE' : 'white', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ fontSize: 16 }}>{s.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{s.info}</div>
                      </div>
                      <span style={{ fontSize: 10, color: '#bbb' }}>{s.minuten} min</span>
                    </button>
                  )
                })}
              </div>
            )
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleSubmit} disabled={!canSubmit}
              style={{ flex: 1, padding: '7px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.45 }}
            >
              Speichern
            </button>
            <button onClick={onClose}
              style={{ padding: '7px 12px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#666' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RecipeModal({ name, rezept, onClose }: { name: string; rezept: import('../lib/state').Rezept | null; onClose: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'white', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div className="topbar">
        <button className="back" onClick={onClose}>‹</button>
        <h1 style={{ fontSize: 15 }}>{rezept?.emoji ?? '🍽'} {name}</h1>
      </div>
      <div className="content">
        {!rezept ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13 }}>
            Kein Rezept verfügbar – beim nächsten Plan von Rémy wird es generiert.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 6, padding: '3px 8px', color: '#666' }}>{rezept.schwierigkeit}</span>
              <span style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 6, padding: '3px 8px', color: '#666' }}>⏱ {rezept.minuten} min</span>
            </div>

            <div className="lbl">Zutaten</div>
            <div style={{ marginBottom: 20 }}>
              {rezept.zutaten.map((z, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 12, color: '#aaa', minWidth: 70 }}>{z.menge}</span>
                  <span style={{ fontSize: 13, color: '#111' }}>{z.name}</span>
                </div>
              ))}
            </div>

            <div className="lbl">Zubereitung</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rezept.schritte.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MealRow({ entry, slot, onSelect, hasRecipe, onChefChange, onReplan, personNames, members: mems }: {
  entry: WeekPlanEntry | null
  slot: 'Mittag' | 'Abend'
  onSelect?: () => void
  hasRecipe?: boolean
  onChefChange?: (chef: Chef) => void
  onReplan?: () => void
  personNames?: Record<Chef, string>
  members?: import('../lib/state').FamilyMember[]
}) {
  const [editing, setEditing] = useState(false)
  const icon = slot === 'Mittag' ? '🌞' : '🌙'
  if (!entry) {
    return (
      <div className="slot-empty">
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span style={{ fontSize: 12 }}>{slot} · noch nicht geplant</span>
      </div>
    )
  }
  const c = CFG[entry.chef] ?? CFG.MA
  const canEdit = !!onChefChange && !!personNames && !!mems
  return (
    <div>
      <div className="meal-row">
        <span style={{ fontSize: 20 }}>{entry.emoji}</span>
        <div
          style={{ flex: 1, cursor: hasRecipe ? 'pointer' : 'default' }}
          onClick={hasRecipe ? onSelect : undefined}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
            {entry.gericht}
            {hasRecipe && <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>›</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>{entry.minuten} min</div>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing(e => !e)}
            title="Gericht ändern"
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: editing ? '#1D9E75' : '#ccc', lineHeight: 1, padding: '0 2px' }}
          >✏️</button>
        )}
        <div className="chef-b" style={{ background: c.bg, color: c.c }}>{entry.chef}</div>
        <span className={`badge${slot === 'Mittag' ? ' mid' : ''}`}>{icon}</span>
      </div>
      {editing && canEdit && (
        <div style={{ background: '#f9f9f9', borderTop: '1px solid #eee', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>Koch ändern</div>
          <ChefPicker current={entry.chef} onSelect={chef => { onChefChange!(chef); setEditing(false) }} personNames={personNames!} members={mems!} />
          {onReplan && (
            <button
              onClick={() => { onReplan(); setEditing(false) }}
              style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left' }}
            >
              ↺ Rémy neu vorschlagen (ganzer Tag)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
