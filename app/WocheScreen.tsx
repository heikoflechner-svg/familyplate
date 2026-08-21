'use client'
import { useState } from 'react'
import { generateWeekPlan } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, Wish, Chef, WochenSlot } from '../lib/state'

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
  wochenchef: Chef
  onWeekPlanChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>) => Promise<void>
  onWishesChange: (wishes: Wish[]) => Promise<void>
}

type View = 'home' | 'week' | 'plan'
type PlanState = 'options' | 'loading' | 'results'

export default function WocheScreen({
  weekPlan, mealsData, planMittag, planWE, freezerItems, pantryItems,
  wishes, wochenchef, onWeekPlanChange, onWishesChange,
}: Props) {
  const [view, setView] = useState<View>('home')
  const [planState, setPlanState] = useState<PlanState>('options')
  const [pendingPlan, setPendingPlan] = useState<WeekPlanEntry[]>([])
  const [neuTage, setNeuTage] = useState<Set<string>>(new Set(['alle']))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  function changePendingChef(tag: string, slot: WochenSlot, chef: Chef) {
    setPendingPlan(prev => prev.map(e => e.tag === tag && e.slot === slot ? { ...e, chef } : e))
    setChefPickerKey(null)
  }

  async function changeActiveChef(tag: string, slot: WochenSlot, chef: Chef) {
    const newPlan = weekPlan.map(e => e.tag === tag && e.slot === slot ? { ...e, chef } : e)
    setChefPickerKey(null)
    await onWeekPlanChange(newPlan, mealsData)
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
    await onWeekPlanChange(newPlan, mealsData)
    setPendingDay(null)
    setSaving(false)
  }

  async function replanDay(tag: string) {
    closeWishForm()
    setChefPickerKey(null)
    setPendingDay(null)
    setDayLoading(tag)
    try {
      const result = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene: weekPlan.filter(e => e.tag !== tag),
        neuTage: [tag],
        wishes: wishes.filter(w => w.tag === tag),
      })
      setPendingDay({ tag, entries: result.filter(e => e.tag === tag) })
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
      const newPlan = await generateWeekPlan({
        planMittag,
        planWE,
        freezerList: getFreezerListString(freezerItems),
        pantryList: getPantryListString(pantryItems),
        behaltene,
        neuTage: tage,
        wishes: wishes.filter(w => tage.includes(w.tag)),
      })
      setPendingPlan(newPlan)
      setPlanState('results')
    } catch {
      setError('Rémy konnte nicht planen. Bitte erneut versuchen.')
      setPlanState('options')
    }
  }

  async function acceptPlan() {
    setSaving(true)
    await onWeekPlanChange(pendingPlan, mealsData)
    setSaving(false)
    setPlanState('options')
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
                  {(['Mittag', 'Abend'] as const).map(slot => {
                    const e = getSlot(pendingPlan, tag, slot)
                    if (!e) return null
                    const key = `${tag}-${slot}`
                    const c = CFG[e.chef] ?? CFG.MA
                    return (
                      <div key={slot}>
                        <div style={{ padding: '8px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{e.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.gericht}</div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>{slot} · {e.minuten} min</div>
                          </div>
                          <button
                            onClick={() => setChefPickerKey(chefPickerKey === key ? null : key)}
                            className="chef-b"
                            style={{ background: c.bg, color: c.c, border: 'none', cursor: 'pointer' }}
                          >
                            {e.chef}
                          </button>
                        </div>
                        {chefPickerKey === key && (
                          <ChefPicker current={e.chef} onSelect={chef => changePendingChef(tag, slot, chef)} />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn primary" onClick={acceptPlan} disabled={saving}>
                  {saving ? '⏳ Speichern…' : `✅ Als Wochenchef bestätigen (${PERSON_NAMES[wochenchef]})`}
                </button>
                <button
                  className="btn"
                  onClick={() => setPlanState('options')}
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
      <div className="screen active">
        <div className="topbar">
          <button className="back" onClick={() => setView('home')}>‹</button>
          <h1>📋 Wochenplan</h1>
        </div>
        <div className="content">
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
                              <ChefPicker current={e.chef} onSelect={chef => changePendingDayChef(e.slot, chef)} />
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
                          {saving ? '⏳…' : `✅ Bestätigen (${PERSON_NAMES[wochenchef]})`}
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
                    return (
                      <div key={slot}>
                        <div style={{ padding: '7px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#bbb', minWidth: 34 }}>{slot === 'Mittag' ? '🌞' : '🌙'}</span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111' }}>{e.gericht}</span>
                          <button
                            onClick={() => setChefPickerKey(chefPickerKey === key ? null : key)}
                            className="chef-b"
                            style={{ background: c.bg, color: c.c, border: 'none', cursor: 'pointer' }}
                          >
                            {e.chef}
                          </button>
                        </div>
                        {chefPickerKey === key && (
                          <ChefPicker current={e.chef} onSelect={chef => changeActiveChef(tag, slot, chef)} />
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
    <div className="screen active">
      <div className="topbar"><h1>🍽 FamilyPlate</h1></div>
      <div className="content">
        <div className="day-lbl">
          Heute · <span style={{ color: '#111', fontWeight: 700 }}>{today}</span>
          <span className="pill today" style={{ marginLeft: 6 }}>Heute</span>
        </div>
        {planMittag && <MealRow entry={todayMittag} slot="Mittag" />}
        <MealRow entry={todayAbend} slot="Abend" />
        <WishesSection
          tag={today}
          wishes={wishes}
          mealsData={mealsData}
          wishFormTag={wishFormTag}
          wishPerson={wishPerson}
          wishKind={wishKind}
          wishText={wishText}
          wishDish={wishDish}
          onOpen={openWishForm}
          onClose={closeWishForm}
          onPersonChange={setWishPerson}
          onKindChange={setWishKind}
          onTextChange={setWishText}
          onDishChange={setWishDish}
          onSubmit={submitWish}
          onRemove={removeWish}
        />

        {nextDays.map(tag => (
          <div key={tag}>
            <div className="day-lbl" style={{ marginTop: 16 }}>{tag}</div>
            {planMittag && <MealRow entry={getSlot(weekPlan, tag, 'Mittag')} slot="Mittag" />}
            <MealRow entry={getSlot(weekPlan, tag, 'Abend')} slot="Abend" />
            <WishesSection
              tag={tag}
              wishes={wishes}
              mealsData={mealsData}
              wishFormTag={wishFormTag}
              wishPerson={wishPerson}
              wishKind={wishKind}
              wishText={wishText}
              wishDish={wishDish}
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
        ))}

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

const PERSON_NAMES: Record<Chef, string> = { PA: 'Heiko', MA: 'Sabine', TI: 'Tim' }

function ChefPicker({ current, onSelect }: { current: Chef; onSelect: (c: Chef) => void }) {
  return (
    <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 4 }}>
      {(['PA', 'MA', 'TI'] as Chef[]).map(p => {
        const c = CFG[p]
        const active = current === p
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid', borderColor: active ? c.c : '#ddd', background: active ? c.bg : 'white', color: active ? c.c : '#aaa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            {p} · {PERSON_NAMES[p]}
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
  tag, wishes, mealsData, wishFormTag, wishPerson, wishKind, wishText, wishDish,
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
                  {p} · {PERSON_NAMES[p]}
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

function MealRow({ entry, slot }: { entry: WeekPlanEntry | null; slot: 'Mittag' | 'Abend' }) {
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
  return (
    <div className="meal-row">
      <span style={{ fontSize: 20 }}>{entry.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{entry.gericht}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{entry.minuten} min</div>
      </div>
      <div className="chef-b" style={{ background: c.bg, color: c.c }}>{entry.chef}</div>
      <span className={`badge${slot === 'Mittag' ? ' mid' : ''}`}>{icon}</span>
    </div>
  )
}
