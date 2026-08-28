'use client'
import { useState } from 'react'
import { generateWeekPlan } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import { buildFamilyPrompt, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, Wish, Chef, WochenSlot, FamilyMember, DayAttendance, ChangeProposal } from '../lib/state'

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
  onWeekPlanChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>) => Promise<void>
  onWishesChange: (wishes: Wish[]) => Promise<void>
  onAttendanceChange: (a: DayAttendance[]) => Promise<void>
  onPlanConfirm?: (entries: WeekPlanEntry[]) => Promise<void>
  onProposalsChange: (proposals: ChangeProposal[]) => Promise<void>
  onWochenchefChange: (chef: Chef) => Promise<void>
}

type View = 'home' | 'week' | 'plan'
type PlanState = 'options' | 'loading' | 'results'

export default function WocheScreen({
  weekPlan, mealsData, planMittag, planWE, freezerItems, pantryItems,
  wishes, currentUser, wochenchef, members, attendance, proposals, onWeekPlanChange, onWishesChange,
  onAttendanceChange, onPlanConfirm, onProposalsChange, onWochenchefChange,
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

  const [wishFormTag, setWishFormTag] = useState<string | null>(null)
  const [wishPerson, setWishPerson] = useState<Chef>('PA')
  const [wishKind, setWishKind] = useState<'text' | 'dish'>('text')
  const [wishText, setWishText] = useState('')
  const [wishDish, setWishDish] = useState<{ name: string; emoji: string } | null>(null)

  function openWishForm(tag: string) {
    setWishFormTag(tag)
    setWishPerson(wochenchef)
    setWishKind('text')
    setWishText('')
    setWishDish(null)
  }

  function closeWishForm() { setWishFormTag(null) }

  async function submitWish() {
    if (!wishFormTag) return
    if (wishKind === 'text' && !wishText.trim()) return
    if (wishKind === 'dish' && !wishDish) return
    const base = { id: crypto.randomUUID(), person: wishPerson, tag: wishFormTag }
    const newWish: Wish = wishKind === 'text'
      ? { ...base, kind: 'text', text: wishText.trim() }
      : { ...base, kind: 'dish', dishName: wishDish!.name, emoji: wishDish!.emoji }
    const filtered = wishes.filter(w => !(w.person === wishPerson && w.tag === wishFormTag))
    await onWishesChange([...filtered, newWish])
    closeWishForm()
  }

  async function removeWish(id: string) {
    await onWishesChange(wishes.filter(w => w.id !== id))
  }

  const [chefPickerKey, setChefPickerKey] = useState<string | null>(null)
  const [editMealKey, setEditMealKey] = useState<string | null>(null)
  const [mealSubMode, setMealSubMode] = useState<'manual' | 'pantry' | null>(null)
  const [manualDishInput, setManualDishInput] = useState('')
  const [wochenchefPickerOpen, setWochenchefPickerOpen] = useState(false)

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
                        return (
                          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: c.bg, color: c.c, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
                            <span>{w.person}</span>
                            <span style={{ fontWeight: 400 }}>{w.tag.slice(0, 2)}</span>
                            <span>·</span>
                            <span style={{ fontWeight: 400 }}>{w.kind === 'text' ? w.text : `${w.emoji} ${w.dishName}`}</span>
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
                <div key={tag} className="week-plan-row">
                  <div className="week-plan-head">
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
                    const c = CFG[e.chef] ?? CFG.MA
                    const isEditing = editMealKey === key
                    const stockItems = [...freezerItems, ...pantryItems]
                    return (
                      <div key={slot}>
                        <div style={{ padding: '8px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{e.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.gericht}</div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>{slot} · {e.minuten} min</div>
                          </div>
                          <button
                            onClick={() => toggleEditMeal(key)}
                            className="chef-b"
                            style={{ background: c.bg, color: c.c, border: 'none', cursor: 'pointer' }}
                          >
                            {e.chef}
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
                  {saving ? '⏳ Speichern…' : `✅ Als Wochenchef bestätigen (${personNames[wochenchef]})`}
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
                <div key={tag} className="week-plan-row">
                  <div className="week-plan-head" style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: tag === today ? '#085041' : '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      {tag}
                    </span>
                    {tag === today && <span className="pill today" style={{ marginLeft: 6 }}>Heute</span>}
                    {!isLoading && !isPending && (
                      <button
                        onClick={() => replanDay(tag)}
                        title="Rémy neu vorschlagen"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#ccc', padding: '0 0 0 8px', lineHeight: 1 }}
                      >
                        ↺
                      </button>
                    )}
                  </div>

                  <AttendanceRow tag={tag} attendance={attendance} members={members} onSave={handleAttendanceSave} />

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
                              <span style={{ fontSize: 10, color: '#bbb', minWidth: 34 }}>{e.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111' }}>{e.emoji} {e.gericht}</span>
                              <button
                                onClick={() => setChefPickerKey(chefPickerKey === key ? null : key)}
                                className="chef-b"
                                style={{ background: c.bg, color: c.c, border: 'none', cursor: 'pointer' }}
                              >
                                {e.chef}
                              </button>
                            </div>
                            {chefPickerKey === key && (
                              <ChefPicker current={e.chef} onSelect={chef => changePendingDayChef(e.slot, chef)} personNames={personNames} members={members} />
                            )}
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
                        <button
                          onClick={confirmPendingDay}
                          disabled={saving}
                          style={{ flex: 1, padding: '7px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                        >
                          {saving ? '⏳…' : `✅ Bestätigen (${personNames[wochenchef]})`}
                        </button>
                        <button
                          onClick={() => setPendingDay(null)}
                          style={{ padding: '7px 12px', background: 'white', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#666' }}
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  )}

                  {!isLoading && !isPending && ([mittag, abend] as const).map((e, i) => {
                    const slot = (i === 0 ? 'Mittag' : 'Abend') as WochenSlot
                    if (!e) return null
                    const key = `${tag}-${slot}`
                    const c = CFG[e.chef] ?? CFG.MA
                    const isEditing = editMealKey === key
                    return (
                      <div key={slot}>
                        <div style={{ padding: '7px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#bbb', minWidth: 34 }}>{slot === 'Mittag' ? '🌞' : '🌙'}</span>
                          <span
                            onClick={() => mealsData[e.gericht] && setSelectedMealName(e.gericht)}
                            style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111', cursor: mealsData[e.gericht] ? 'pointer' : 'default' }}
                          >{e.emoji} {e.gericht}{mealsData[e.gericht] ? <span style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }}>›</span> : null}</span>
                          <button
                            onClick={() => toggleEditMeal(key)}
                            title="Gericht ändern"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: isEditing ? '#1D9E75' : '#ccc', lineHeight: 1, padding: '0 2px' }}
                          >✏️</button>
                          <div className="chef-b" style={{ background: c.bg, color: c.c }}>{e.chef}</div>
                        </div>
                        {isEditing && (
                          <div style={{ background: '#f9f9f9', borderTop: '1px solid #eee', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>Koch ändern</div>
                            <ChefPicker current={e.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
                            <button
                              onClick={() => replanDay(tag)}
                              disabled={dayLoading === tag}
                              style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left' }}
                            >
                              ↺ Rémy neu vorschlagen (ganzer Tag)
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {!isLoading && !isPending && (
                    <WishesSection
                      tag={tag}
                      wishes={wishes}
                      mealsData={mealsData}
                      wishFormTag={wishFormTag}
                      wishPerson={wishPerson}
                      wishKind={wishKind}
                      wishText={wishText}
                      wishDish={wishDish}
                      personNames={personNames}
                      onOpen={openWishForm}
                      onClose={closeWishForm}
                      onPersonChange={setWishPerson}
                      onKindChange={setWishKind}
                      onTextChange={setWishText}
                      onDishChange={setWishDish}
                      onSubmit={submitWish}
                      onRemove={removeWish}
                    />
                  )}
                </div>
              )
            })
          )}
          <button className="btn soft" style={{ marginTop: 8 }} onClick={goToPlan}>
            🔄 {weekPlan.length > 0 ? 'Neu planen' : 'Woche planen'}
          </button>
        </div>
      </div>
    )
  }

  // ── Home view ─────────────────────────────────────────────────────────────
  const todayMittag = getSlot(weekPlan, today, 'Mittag')
  const todayAbend = getSlot(weekPlan, today, 'Abend')

  function renderHomeSlot(tag: string, slot: WochenSlot, entry: WeekPlanEntry | null) {
    const slotIcon = slot === 'Mittag' ? '🌞' : '🌙'
    if (!entry) {
      return (
        <div key={slot} className="slot-empty">
          <span style={{ fontSize: 11 }}>{slotIcon}</span>
          <span style={{ fontSize: 12 }}>{slot} · noch nicht geplant</span>
        </div>
      )
    }
    const key = `${tag}-${slot}`
    const c = CFG[entry.chef] ?? CFG.MA
    const isEditing = editMealKey === key
    const hasRecipe = !!mealsData[entry.gericht]
    return (
      <div key={slot}>
        <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #eee', marginBottom: 6, background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{entry.emoji}</span>
          <div
            style={{ flex: 1, cursor: hasRecipe ? 'pointer' : 'default' }}
            onClick={hasRecipe ? () => setSelectedMealName(entry.gericht) : undefined}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
              {entry.gericht}
              {hasRecipe && <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>›</span>}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>{entry.minuten} min</div>
          </div>
          <button
            onClick={() => toggleEditMeal(key)}
            title="Gericht ändern"
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: isEditing ? '#1D9E75' : '#bbb', lineHeight: 1, padding: '0 4px' }}
          >✏️</button>
          <div className="chef-b" style={{ background: c.bg, color: c.c }}>{entry.chef}</div>
          <span className={`badge${slot === 'Mittag' ? ' mid' : ''}`}>{slotIcon}</span>
        </div>
        {isEditing && (
          <div style={{ background: '#f9f9f9', padding: '10px 12px', marginTop: -8, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 8, borderRadius: '0 0 12px 12px', border: '1px solid #eee', borderTop: 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>Koch ändern</div>
            <ChefPicker current={entry.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} personNames={personNames} members={members} />
            <button
              onClick={() => replanDay(tag)}
              disabled={dayLoading === tag}
              style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left' }}
            >
              ↺ Rémy neu vorschlagen (ganzer Tag)
            </button>
          </div>
        )}
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
          <button className="btn primary" style={{ width: 'auto', padding: '12px 32px' }} onClick={goToPlan}>
            🐀 Woche planen
          </button>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 11, color: '#aaa', flex: 1 }}>Wochenchef</span>
          <button
            onClick={() => setWochenchefPickerOpen(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: `1px solid ${CFG[wochenchef]?.c ?? '#ddd'}`, background: CFG[wochenchef]?.bg ?? 'white', color: CFG[wochenchef]?.c ?? '#333', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {personNames[wochenchef]}
            <span style={{ fontSize: 9, opacity: 0.7 }}>{wochenchefPickerOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        {wochenchefPickerOpen && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(Object.keys(personNames) as Chef[]).map(c => {
              const cfg = CFG[c] ?? CFG.MA
              const active = wochenchef === c
              return (
                <button
                  key={c}
                  onClick={async () => { await onWochenchefChange(c); setWochenchefPickerOpen(false) }}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `1px solid ${active ? cfg.c : '#ddd'}`, background: active ? cfg.bg : 'white', color: active ? cfg.c : '#999', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  {personNames[c]}
                </button>
              )
            })}
          </div>
        )}
        {renderAllProposals()}
        <div className="day-lbl">
          Heute · <span style={{ color: '#111', fontWeight: 700 }}>{today}</span>
          <span className="pill today" style={{ marginLeft: 6 }}>Heute</span>
        </div>
        <AttendanceRow tag={today} attendance={attendance} members={members} onSave={handleAttendanceSave} />
        {planMittag && renderHomeSlot(today, 'Mittag', todayMittag)}
        {renderHomeSlot(today, 'Abend', todayAbend)}
        <WishesSection
          tag={today}
          wishes={wishes}
          mealsData={mealsData}
          wishFormTag={wishFormTag}
          wishPerson={wishPerson}
          wishKind={wishKind}
          wishText={wishText}
          wishDish={wishDish}
          personNames={personNames}
          onOpen={openWishForm}
          onClose={closeWishForm}
          onPersonChange={setWishPerson}
          onKindChange={setWishKind}
          onTextChange={setWishText}
          onDishChange={setWishDish}
          onSubmit={submitWish}
          onRemove={removeWish}
        />

        {nextDays.map(tag => {
          const nextMittag = getSlot(weekPlan, tag, 'Mittag')
          const nextAbend = getSlot(weekPlan, tag, 'Abend')
          return (
          <div key={tag}>
            <div className="day-lbl" style={{ marginTop: 16 }}>{tag}</div>
            <AttendanceRow tag={tag} attendance={attendance} members={members} onSave={handleAttendanceSave} />
            {planMittag && renderHomeSlot(tag, 'Mittag', nextMittag)}
            {renderHomeSlot(tag, 'Abend', nextAbend)}
            <WishesSection
              tag={tag}
              wishes={wishes}
              mealsData={mealsData}
              wishFormTag={wishFormTag}
              wishPerson={wishPerson}
              wishKind={wishKind}
              wishText={wishText}
              wishDish={wishDish}
              personNames={personNames}
              onOpen={openWishForm}
              onClose={closeWishForm}
              onPersonChange={setWishPerson}
              onKindChange={setWishKind}
              onTextChange={setWishText}
              onDishChange={setWishDish}
              onSubmit={submitWish}
              onRemove={removeWish}
            />
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
      <div style={{ padding: '0 20px 16px' }}>
        <button className="btn soft" onClick={goToPlan}>🔄 Neu planen</button>
      </div>
    </div>
  )
}

function AttendanceRow({
  tag, attendance, members, onSave,
}: {
  tag: string
  attendance: DayAttendance[]
  members: FamilyMember[]
  onSave: (updated: DayAttendance) => void
}) {
  const chefs = members.map(m => m.id) as Chef[]
  const current = attendance.find(a => a.tag === tag) ?? { tag, anwesend: chefs, gaeste: 0 }

  const [open, setOpen] = useState(false)
  const [localAnwesend, setLocalAnwesend] = useState<Chef[]>(chefs)
  const [localGaeste, setLocalGaeste] = useState(0)

  function handleOpen() {
    setLocalAnwesend(current.anwesend)
    setLocalGaeste(current.gaeste)
    setOpen(true)
  }

  function toggleChef(id: Chef) {
    setLocalAnwesend(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function handleSave() {
    onSave({ tag, anwesend: localAnwesend, gaeste: localGaeste })
    setOpen(false)
  }

  const totalEsser = current.anwesend.length + current.gaeste

  return (
    <div style={{ padding: '5px 12px 6px', borderTop: '1px solid #f8f8f8' }}>
      {!open ? (
        <div
          onClick={handleOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minHeight: 26 }}
        >
          <span style={{ fontSize: 11, color: '#ccc' }}>👥</span>
          {members.map(m => {
            const present = current.anwesend.includes(m.id)
            const col = CFG[m.id]
            return (
              <span key={m.id} style={{
                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: present ? col.bg : '#f5f5f5',
                color: present ? col.c : '#ccc',
                transition: 'all .15s',
              }}>
                {m.name.slice(0, 2)}
              </span>
            )
          })}
          {current.gaeste > 0 && (
            <span style={{ fontSize: 11, color: '#888', background: '#f5f5f5', padding: '2px 8px', borderRadius: 8 }}>
              +{current.gaeste} Gast{current.gaeste > 1 ? 'e' : ''}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#999', marginLeft: 2 }}>
            {totalEsser} {totalEsser === 1 ? 'Person' : 'Personen'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ddd' }}>✏️</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>Wer ist dabei?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {members.map(m => {
              const active = localAnwesend.includes(m.id)
              const col = CFG[m.id]
              return (
                <button
                  key={m.id}
                  onClick={() => toggleChef(m.id)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${active ? col.c : '#eee'}`,
                    background: active ? col.bg : 'white',
                    color: active ? col.c : '#ccc',
                    cursor: 'pointer',
                  }}
                >
                  {m.name}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#888', flex: 1 }}>Gäste</span>
            <button
              onClick={() => setLocalGaeste(g => Math.max(0, g - 1))}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #eee', background: 'white', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >−</button>
            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{localGaeste}</span>
            <button
              onClick={() => setLocalGaeste(g => g + 1)}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #eee', background: 'white', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >+</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setOpen(false)}
              style={{ flex: 1, padding: '8px', border: '1px solid #eee', borderRadius: 8, fontSize: 12, background: 'white', cursor: 'pointer', color: '#aaa' }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              style={{ flex: 2, padding: '8px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#0C447C', color: 'white', cursor: 'pointer' }}
            >
              ✓ Übernehmen
            </button>
          </div>
        </div>
      )}
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

interface WishesSectionProps {
  tag: string
  wishes: Wish[]
  mealsData: Record<string, Rezept>
  wishFormTag: string | null
  wishPerson: Chef
  wishKind: 'text' | 'dish'
  wishText: string
  wishDish: { name: string; emoji: string } | null
  personNames: Record<Chef, string>
  onOpen: (tag: string) => void
  onClose: () => void
  onPersonChange: (p: Chef) => void
  onKindChange: (k: 'text' | 'dish') => void
  onTextChange: (t: string) => void
  onDishChange: (d: { name: string; emoji: string } | null) => void
  onSubmit: () => void
  onRemove: (id: string) => void
}

function WishesSection({
  tag, wishes, mealsData, wishFormTag, wishPerson, wishKind, wishText, wishDish, personNames,
  onOpen, onClose, onPersonChange, onKindChange, onTextChange, onDishChange, onSubmit, onRemove,
}: WishesSectionProps) {
  const dayWishes = wishes.filter(w => w.tag === tag)
  const dishes = Object.entries(mealsData).map(([name, r]) => ({ name, emoji: r.emoji }))
  const isOpen = wishFormTag === tag
  const canSubmit = wishKind === 'text' ? wishText.trim().length > 0 : wishDish !== null

  return (
    <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {dayWishes.map(w => {
          const c = CFG[w.person] ?? CFG.MA
          return (
            <span key={w.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: c.bg, color: c.c, borderRadius: 8, padding: '2px 6px', fontSize: 11 }}>
              <span style={{ fontWeight: 700 }}>{w.person}</span>
              <span>·</span>
              <span>{w.kind === 'text' ? w.text : `${w.emoji} ${w.dishName}`}</span>
              <button onClick={() => onRemove(w.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: '0 0 0 2px', lineHeight: 1 }}>×</button>
            </span>
          )
        })}
        {!isOpen && (
          <button
            onClick={() => onOpen(tag)}
            style={{ fontSize: 11, color: '#bbb', border: '1px dashed #ddd', borderRadius: 8, padding: '2px 8px', background: 'none', cursor: 'pointer' }}
          >
            + Wunsch
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{ marginTop: 8, padding: 10, background: '#f9f9f9', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['PA', 'MA', 'TI'] as Chef[]).map(p => {
              const c = CFG[p]
              const active = wishPerson === p
              return (
                <button
                  key={p}
                  onClick={() => onPersonChange(p)}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid', borderColor: active ? c.c : '#ddd', background: active ? c.bg : 'white', color: active ? c.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  {p} · {personNames[p]}
                </button>
              )
            })}
          </div>

          {dishes.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {(['text', 'dish'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => onKindChange(k)}
                  style={{ fontSize: 11, padding: '2px 10px', border: '1px solid', borderColor: wishKind === k ? '#1D9E75' : '#ddd', borderRadius: 6, background: wishKind === k ? '#E1F5EE' : 'white', color: wishKind === k ? '#0F6E56' : '#aaa', cursor: 'pointer' }}
                >
                  {k === 'text' ? 'Freitext' : 'Gericht wählen'}
                </button>
              ))}
            </div>
          )}

          {wishKind === 'text' ? (
            <input
              type="text"
              value={wishText}
              onChange={e => onTextChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && onSubmit()}
              placeholder="z.B. Pizza, etwas Leichtes, Pasta…"
              autoFocus
              style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
              {dishes.map(d => (
                <button
                  key={d.name}
                  onClick={() => onDishChange(wishDish?.name === d.name ? null : d)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: '1px solid', borderColor: wishDish?.name === d.name ? '#1D9E75' : '#eee', borderRadius: 6, background: wishDish?.name === d.name ? '#E1F5EE' : 'white', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span>{d.emoji}</span>
                  <span style={{ fontSize: 12 }}>{d.name}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              style={{ flex: 1, padding: '7px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.45 }}
            >
              Speichern
            </button>
            <button
              onClick={onClose}
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
