'use client'
import { useState } from 'react'
import { generateWeekPlan, getRemySuggestions, generateRecipe } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import { buildFamilyPrompt, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, Wish, Chef, WochenSlot, FamilyMember, DayAttendance, ChangeProposal, ShoppingItem, RemyVorschlag } from '../lib/state'
import SlotWunschPanel from './SlotWunschPanel'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

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
  proposals: ChangeProposal[]
  planConfirmed: boolean
  shopDone: boolean
  onWeekPlanChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>) => Promise<void>
  onWishesChange: (wishes: Wish[]) => Promise<void>
  onAttendanceChange: (a: DayAttendance[]) => Promise<void>
  onPlanConfirm?: (entries: WeekPlanEntry[]) => Promise<void>
  onProposalsChange: (proposals: ChangeProposal[]) => Promise<void>
  onWochenchefChange: (chef: Chef) => Promise<void>
  onPlanConfirmedChange: (confirmed: boolean) => Promise<void>
  onShopDoneChange: (done: boolean) => Promise<void>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => Promise<void>
}

type View = 'home' | 'week' | 'plan'
type PlanState = 'options' | 'loading' | 'results'

export default function WocheScreen({
  weekPlan, mealsData, planMittag, planWE, freezerItems, pantryItems,
  wishes, currentUser, wochenchef, members, attendance, proposals, planConfirmed, shopDone, onWeekPlanChange, onWishesChange,
  onAttendanceChange, onPlanConfirm, onProposalsChange, onWochenchefChange, onPlanConfirmedChange, onShopDoneChange,
  shoppingList, onShoppingListChange,
}: Props) {
  const personNames: Record<Chef, string> = Object.fromEntries(
    (members.length ? members : DEFAULT_MEMBERS).map(m => [m.id, m.name])
  ) as Record<Chef, string>
  const familyPrompt = buildFamilyPrompt(members.length ? members : DEFAULT_MEMBERS)
  const [view, setView] = useState<View>('home')
  const [planState, setPlanState] = useState<PlanState>('options')
  const [pendingPlan, setPendingPlan] = useState<WeekPlanEntry[]>([])
  const [pendingPlanMeals, setPendingPlanMeals] = useState<Record<string, Rezept>>({})
  const [pendingDayMeals, setPendingDayMeals] = useState<Record<string, Rezept>>({})
  const [neuTage, setNeuTage] = useState<Set<string>>(new Set(['alle']))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedMealName, setSelectedMealName] = useState<string | null>(null)

  const [chefAltSelection, setChefAltSelection] = useState<Record<string, string>>({})
  const [chefErgaenzungIds, setChefErgaenzungIds] = useState<string[]>([])
  const [nachtragsIds, setNachtragsIds] = useState<string[]>([])
  const [nachtragsAltIds, setNachtragsAltIds] = useState<string[]>([])

  const [wishFormKey, setWishFormKey] = useState<string | null>(null)

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
  const [personsEditKey, setPersonsEditKey] = useState<string | null>(null)

  function getSlotPersonen(tag: string, slot: WochenSlot): number {
    const memberCount = (members.length ? members : DEFAULT_MEMBERS).length
    const day = attendance.find(a => a.tag === tag)
    if (!day) return memberCount
    if (slot === 'Mittag' && day.mittagPersonen != null) return day.mittagPersonen
    if (slot === 'Abend' && day.abendPersonen != null) return day.abendPersonen
    return day.anwesend.length + day.gaeste
  }

  async function handleSlotPersonenSave(tag: string, slot: WochenSlot, total: number) {
    const chefs = (members.length ? members : DEFAULT_MEMBERS).map(m => m.id) as Chef[]
    const current = attendance.find(a => a.tag === tag) ?? { tag, anwesend: chefs, gaeste: 0 }
    const updated = slot === 'Mittag'
      ? { ...current, mittagPersonen: total }
      : { ...current, abendPersonen: total }
    await onAttendanceChange([...attendance.filter(a => a.tag !== tag), updated])
    setPersonsEditKey(null)
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
    const currentEntry = weekPlan.find(e => e.tag === tag && e.slot === slot)
    if (!currentEntry) return
    closeMealPanel()
    if (currentUser === wochenchef) {
      const newPlan = weekPlan.map(e => e.tag === tag && e.slot === slot ? { ...e, chef } : e)
      await onWeekPlanChange(newPlan, mealsData)
    } else {
      await onProposalsChange([...proposals, {
        id: crypto.randomUUID(),
        tag,
        slot,
        vonChef: currentUser,
        fuerChef: wochenchef,
        entry: { ...currentEntry, chef },
        createdAt: new Date().toISOString(),
      }])
    }
  }

  async function acceptProposal(proposal: ChangeProposal) {
    const newPlan = weekPlan.map(e =>
      e.tag === proposal.tag && e.slot === proposal.slot ? proposal.entry : e
    )
    await onWeekPlanChange(newPlan, mealsData)
    await onProposalsChange(proposals.filter(p => p.id !== proposal.id))
  }

  async function rejectProposal(id: string) {
    await onProposalsChange(proposals.filter(p => p.id !== id))
  }

  function renderAllProposals() {
    if (currentUser !== wochenchef || proposals.length === 0) return null
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
          📬 Offene Vorschläge ({proposals.length})
        </div>
        {proposals.map(p => {
          const slotLabel = p.slot === 'Mittag' ? '🌞 Mittag' : '🌙 Abend'
          return (
            <div key={p.id} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#92400E', fontWeight: 700, marginBottom: 3 }}>
                {personNames[p.vonChef]} · {p.tag} {slotLabel}
              </div>
              <div style={{ fontSize: 12, color: '#111', marginBottom: 6 }}>
                {p.entry.emoji} {p.entry.gericht} · Koch: {personNames[p.entry.chef]}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => acceptProposal(p)}
                  style={{ flex: 1, padding: '5px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >✅ Übernehmen</button>
                <button
                  onClick={() => rejectProposal(p.id)}
                  style={{ padding: '5px 10px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#888' }}
                >✕ Ablehnen</button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const [dayLoading, setDayLoading] = useState<string | null>(null)
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

  function handleAttendanceSave(updated: DayAttendance) {
    onAttendanceChange([...attendance.filter(a => a.tag !== updated.tag), updated])
  }

  const today = todayGerman()
  const activeDays = planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)
  const plannedDays = WOCHENTAGE.filter(t => weekPlan.some(e => e.tag === t))
  const todayIdx = activeDays.indexOf(today)
  const nextDays = activeDays.slice(todayIdx + 1, todayIdx + 3)

  function goToPlan() {
    setView('plan')
    setPlanState('options')
    setError('')
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
    setSaving(false)
    setPlanState('options')
    setPendingPlanMeals({})
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

    await onWeekPlanChange(finalPlan, updatedMealsData)
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
    const nachtragsAltWishes = wishes.filter(w => w.postConfirm && w.type === 'alternative')
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
    await onWeekPlanChange(finalPlan, { ...mealsData, ...newMeals })
    const processedIds = new Set(nachtragsAltWishes.map(w => w.id))
    await onWishesChange(wishes.filter(w => !processedIds.has(w.id)))
    setNachtragsAltIds([])
    setSaving(false)
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
              <div style={{ fontSize: 48, marginBottom: 14 }}>🐀</div>
              <div style={{ fontSize: 14, color: '#aaa' }}>Rémy plant deine Woche…</div>
            </div>
          )}

          {planState === 'options' && (
            <>
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
                🐀 Rémy schlägt vor
              </button>
            </>
          )}

          {planState === 'results' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#085041', marginBottom: 4 }}>
                ✅ Rémy hat geplant
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginBottom: 14 }}>Koch antippen zum Ändern</div>
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
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{e.gericht}</div>
                            <div style={{ fontSize: 11, color: '#aaa' }}>{e.minuten} min</div>
                          </div>
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
                  onClick={() => { setPlanState('options'); closeMealPanel() }}
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
          {renderAllProposals()}
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
                    const isPersonsEdit = personsEditKey === key
                    const canEdit = !planConfirmed || currentUser === wochenchef
                    const slotPersonen = getSlotPersonen(tag, slot)
                    return (
                      <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <SlotPill slot={slot} />
                          <span
                            onClick={canEdit ? () => toggleEditMeal(key) : undefined}
                            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                          >{personNames[e.chef]}</span>
                          <span style={{ fontSize: 10, color: '#ddd' }}>·</span>
                          <span
                            onClick={canEdit ? () => setPersonsEditKey(isPersonsEdit ? null : key) : undefined}
                            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
                          >{slotPersonen} {slotPersonen === 1 ? 'Person' : 'Personen'}</span>
                        </div>
                        {isEditing && canEdit && (
                          <div style={{ padding: '4px 12px 8px', background: '#f9f9f9' }}>
                            <ChefPicker current={e.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
                            {planConfirmed && currentUser === wochenchef && (
                              <button onClick={() => replanDay(tag)} disabled={dayLoading === tag} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left', width: '100%', marginTop: 4 }}>
                                ↺ Rémy neu vorschlagen (ganzer Tag)
                              </button>
                            )}
                          </div>
                        )}
                        {isPersonsEdit && canEdit && (
                          <PersonsEditor tag={tag} slot={slot} initial={slotPersonen} onSave={handleSlotPersonenSave} />
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
                          personNames={personNames} planMittag={planMittag} lockedSlot={slot} showExisting={false} canAdd={!shopDone}
                          isOpen={wishFormKey === `${tag}-${slot}`} initialPerson={currentUser} familyPrompt={familyPrompt}
                          onOpen={() => openWishForm(tag, slot)} onClose={closeWishForm} onSubmitWish={handleWishSubmit} onRemove={removeWish}
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
          {currentUser === wochenchef && !planConfirmed && weekPlan.length > 0 && (
            <div style={{
              margin: '16px 0 0', padding: '14px 16px',
              background: '#F0FAF5', borderRadius: 12, border: '1px solid #B2DFCC',
            }}>
              <div style={{ fontSize: 12, color: '#0F6E56', fontWeight: 600, marginBottom: 6 }}>
                Wochenchef-Entscheidung abschließen
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                {Object.keys(chefAltSelection).filter(k => chefAltSelection[k] !== 'original').length} Alternative(n) übernommen ·{' '}
                {chefErgaenzungIds.length} Ergänzung(en) auf Einkaufsliste
              </div>
              <button
                className="btn primary"
                onClick={confirmAsChef}
                disabled={saving}
                style={{ background: '#1D9E75', fontSize: 13 }}
              >
                {saving ? '⏳ Speichern…' : `✅ Als Wochenchef bestätigen (${personNames[wochenchef]})`}
              </button>
            </div>
          )}

          {(() => {
            const nachtragsWishes = wishes.filter(w => w.postConfirm && w.type === 'ergaenzung')
            if (!planConfirmed || !nachtragsWishes.length || currentUser !== wochenchef) return null
            return (
              <div style={{ margin: '16px 0 0', padding: '14px 16px', background: '#FFFBEB', borderRadius: 12, border: '1px solid #FCD34D' }}>
                <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600, marginBottom: 6 }}>
                  📬 Nachtrags-Ergänzungen ({nachtragsWishes.length})
                </div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                  Neue Wünsche nach der Bestätigung — ankreuzen, was auf die Einkaufsliste soll:
                </div>
                {nachtragsWishes.map(w => {
                  const checked = nachtragsIds.includes(w.id)
                  const c = CFG[w.person] ?? CFG.MA
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <button
                        onClick={() => setNachtragsIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])}
                        style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer', border: `1px solid ${checked ? '#1D9E75' : '#ddd'}`, background: checked ? '#1D9E75' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                      </button>
                      <span style={{ fontSize: 12, flex: 1, color: '#555', fontStyle: 'italic' }}>„{w.type === 'ergaenzung' ? w.text : ''}"</span>
                      <span style={{ fontSize: 10, color: '#888' }}>{w.tag.slice(0, 2)} {w.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>{personNames[w.person]}</span>
                    </div>
                  )
                })}
                <button
                  className="btn primary"
                  onClick={confirmNachtraege}
                  disabled={saving || nachtragsIds.length === 0}
                  style={{ background: '#1D9E75', fontSize: 12, marginTop: 8, opacity: nachtragsIds.length === 0 ? 0.4 : 1 }}
                >
                  {saving ? '⏳…' : `🛒 ${nachtragsIds.length} Ergänzung(en) zur Einkaufsliste`}
                </button>
              </div>
            )
          })()}

          {(() => {
            const nachtragsAltWishes = wishes.filter(w => w.postConfirm && w.type === 'alternative')
            if (!planConfirmed || !nachtragsAltWishes.length || currentUser !== wochenchef) return null
            return (
              <div style={{ margin: '16px 0 0', padding: '14px 16px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE' }}>
                <div style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600, marginBottom: 6 }}>
                  🔄 Nachträgliche Alternativen ({nachtragsAltWishes.length})
                </div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                  Gerichtswünsche nach der Bestätigung — ankreuzen was du übernehmen möchtest:
                </div>
                {nachtragsAltWishes.map(w => {
                  const checked = nachtragsAltIds.includes(w.id)
                  const c = CFG[w.person] ?? CFG.MA
                  const original = weekPlan.find(e => e.tag === w.tag && e.slot === w.slot)
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <button
                        onClick={() => setNachtragsAltIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])}
                        style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer', border: `1px solid ${checked ? '#1D9E75' : '#ddd'}`, background: checked ? '#1D9E75' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
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
                <button
                  className="btn primary"
                  onClick={confirmNachtragsAlternativen}
                  disabled={saving}
                  style={{ background: '#1D9E75', fontSize: 12, marginTop: 8 }}
                >
                  {saving ? '⏳…' : `✅ Entscheidung übernehmen`}
                </button>
                <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>Nicht angekreuzte Alternativen werden verworfen.</div>
              </div>
            )
          })()}

          {currentUser === wochenchef && (
            <button className="btn soft" style={{ marginTop: 8 }} onClick={goToPlan}>
              🔄 {weekPlan.length > 0 ? 'Neu planen' : 'Woche planen'}
            </button>
          )}
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
    const isPersonsEdit = personsEditKey === key
    const hasRecipe = !!mealsData[entry.gericht]
    const canEdit = !planConfirmed || currentUser === wochenchef
    const slotPersonen = getSlotPersonen(tag, slot)
    return (
      <div key={slot} style={{ borderTop: '1px solid #f0f0f0' }}>
        <div style={{ padding: '8px 12px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SlotPill slot={slot} />
          <span
            onClick={canEdit ? () => toggleEditMeal(key) : undefined}
            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
          >{personNames[entry.chef]}</span>
          <span style={{ fontSize: 10, color: '#ddd' }}>·</span>
          <span
            onClick={canEdit ? () => setPersonsEditKey(isPersonsEdit ? null : key) : undefined}
            style={{ fontSize: 11, color: '#555', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#bbb' }}
          >{slotPersonen} {slotPersonen === 1 ? 'Person' : 'Personen'}</span>
        </div>
        {isEditing && canEdit && (
          <div style={{ padding: '4px 12px 8px', background: '#f9f9f9' }}>
            <ChefPicker current={entry.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
            {planConfirmed && currentUser === wochenchef && (
              <button onClick={() => replanDay(tag)} disabled={dayLoading === tag} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left', width: '100%', marginTop: 4 }}>
                ↺ Rémy neu vorschlagen (ganzer Tag)
              </button>
            )}
          </div>
        )}
        {isPersonsEdit && canEdit && (
          <PersonsEditor tag={tag} slot={slot} initial={slotPersonen} onSave={handleSlotPersonenSave} />
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
            </div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{entry.minuten} min</div>
          </div>
        </div>
        <WishesSection
          tag={tag} wishes={wishes} freezerItems={freezerItems} pantryItems={pantryItems}
          personNames={personNames} planMittag={planMittag} lockedSlot={slot} canAdd={!shopDone}
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
        <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🐀</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Rémy wartet</div>
          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 28, textAlign: 'center' }}>
            Tippe hier – Rémy plant deine Woche in Sekunden.
          </div>
          {currentUser === wochenchef ? (
            <button className="btn primary" style={{ width: 'auto', padding: '12px 32px' }} onClick={goToPlan}>
              🐀 Woche planen
            </button>
          ) : (
            <div style={{ fontSize: 12, color: '#bbb' }}>
              {personNames[wochenchef]} ist diese Woche Wochenchef
            </div>
          )}
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
        {renderAllProposals()}
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
      </div>
      {currentUser === wochenchef && (
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

function PersonsEditor({ tag, slot, initial, onSave }: {
  tag: string; slot: WochenSlot; initial: number; onSave: (tag: string, slot: WochenSlot, total: number) => void
}) {
  const [local, setLocal] = useState(initial)
  return (
    <div style={{ padding: '6px 12px 8px', display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', borderTop: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 11, color: '#888', flex: 1 }}>Personen</span>
      <button onClick={() => setLocal(t => Math.max(1, t - 1))}
        style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #eee', background: 'white', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>−</button>
      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{local}</span>
      <button onClick={() => setLocal(t => t + 1)}
        style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #eee', background: 'white', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>+</button>
      <button onClick={() => onSave(tag, slot, local)}
        style={{ padding: '5px 12px', border: 'none', borderRadius: 7, background: '#1D9E75', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓</button>
    </div>
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
  lockedSlot, showExisting = true, canAdd = true, isOpen, initialPerson, familyPrompt,
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
              { mode: 'ergaenzung', label: '➕ Ergänzung' },
              { mode: 'alternative', label: '✏️ Eigenes Gericht' },
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
