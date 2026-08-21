'use client'
import { useState } from 'react'
import { generateWeekPlan } from '../lib/mealLogic'
import { getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem } from '../lib/state'

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
  onWeekPlanChange: (plan: WeekPlanEntry[], meals: Record<string, Rezept>) => Promise<void>
}

type View = 'home' | 'week' | 'plan'
type PlanState = 'options' | 'loading' | 'results'

export default function WocheScreen({
  weekPlan, mealsData, planMittag, planWE, freezerItems, pantryItems, onWeekPlanChange,
}: Props) {
  const [view, setView] = useState<View>('home')
  const [planState, setPlanState] = useState<PlanState>('options')
  const [pendingPlan, setPendingPlan] = useState<WeekPlanEntry[]>([])
  const [neuTage, setNeuTage] = useState<Set<string>>(new Set(['alle']))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
              <div style={{ fontSize: 13, fontWeight: 600, color: '#085041', marginBottom: 14 }}>
                ✅ Rémy hat geplant
              </div>
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
                    const c = CFG[e.chef] ?? CFG.MA
                    return (
                      <div key={slot} style={{ padding: '8px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{e.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{e.gericht}</div>
                          <div style={{ fontSize: 10, color: '#aaa' }}>{slot} · {e.minuten} min</div>
                        </div>
                        <div className="chef-b" style={{ background: c.bg, color: c.c }}>{e.chef}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn primary" onClick={acceptPlan} disabled={saving}>
                  {saving ? '⏳ Speichern…' : '✅ Woche übernehmen'}
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
              return (
                <div key={tag} className="week-plan-row">
                  <div className="week-plan-head">
                    <span style={{ fontSize: 11, fontWeight: 700, color: tag === today ? '#085041' : '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      {tag}
                    </span>
                    {tag === today && <span className="pill today" style={{ marginLeft: 8 }}>Heute</span>}
                  </div>
                  {([mittag, abend] as const).map((e, i) => {
                    const slot = i === 0 ? 'Mittag' : 'Abend'
                    if (!e) return null
                    const c = CFG[e.chef] ?? CFG.MA
                    return (
                      <div key={slot} style={{ padding: '7px 12px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#bbb', minWidth: 34 }}>{slot === 'Mittag' ? '🌞' : '🌙'}</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111' }}>{e.gericht}</span>
                        <div className="chef-b" style={{ background: c.bg, color: c.c }}>{e.chef}</div>
                      </div>
                    )
                  })}
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

        {nextDays.map(tag => (
          <div key={tag}>
            <div className="day-lbl" style={{ marginTop: 16 }}>{tag}</div>
            {planMittag && <MealRow entry={getSlot(weekPlan, tag, 'Mittag')} slot="Mittag" />}
            <MealRow entry={getSlot(weekPlan, tag, 'Abend')} slot="Abend" />
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
