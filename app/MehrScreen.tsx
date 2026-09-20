'use client'
import { useState } from 'react'
import type { Chef, FamilyMember, ChangeProposal, WeekPlanEntry, NextWeekData } from '../lib/state'

function getNextMondayIso(d: Date = new Date()): string {
  const date = new Date(d)
  const dow = date.getDay()
  date.setDate(date.getDate() + (dow === 0 ? 1 : 8 - dow))
  return date.toISOString().slice(0, 10)
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const TAG_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
}

const MEMBER_PALETTE = [
  { bg: '#E6F1FB', c: '#0C447C' },
  { bg: '#E1F5EE', c: '#0F6E56' },
  { bg: '#FBEAF0', c: '#72243E' },
  { bg: '#FEF3C7', c: '#92400E' },
]
const CFG: Record<string, { bg: string; c: string }> = {
  PA: MEMBER_PALETTE[0], MA: MEMBER_PALETTE[1], TI: MEMBER_PALETTE[2],
  M1: MEMBER_PALETTE[0], M2: MEMBER_PALETTE[1], M3: MEMBER_PALETTE[2], M4: MEMBER_PALETTE[3],
}

type View = 'overview' | 'einkauf' | 'wochenchef'

interface Props {
  currentUser: Chef
  wochenchef: Chef
  members: FamilyMember[]
  weekPlan: WeekPlanEntry[]
  shoppingDays: string[]
  shoppingPersons: Record<string, Chef>
  proposals: ChangeProposal[]
  onShoppingDaysChange: (days: string[]) => Promise<void>
  onShoppingPersonsChange: (persons: Record<string, Chef>) => Promise<void>
  onShoppingProposalSubmit: (proposal: ChangeProposal) => Promise<void>
  onGoToAttendance: () => void
  nextWeekData?: NextWeekData | null
  nextWeekStart?: string | null
  onWochenchefChange: (chef: Chef) => Promise<void>
  onNextWeekDataChange?: (data: Partial<NextWeekData>, nextMonday: string) => Promise<void>
  mittagsloseTage: string[]
  planWE: boolean
  onMittagsloseTageChange: (tage: string[]) => void
  onPlanWEChange: (val: boolean) => void
  laeden: string[]
  onLaedenChange: (laeden: string[]) => Promise<void>
}

export default function MehrScreen({
  currentUser, wochenchef, members, weekPlan, shoppingDays, shoppingPersons, proposals,
  onShoppingDaysChange, onShoppingPersonsChange, onShoppingProposalSubmit, onGoToAttendance,
  nextWeekData, nextWeekStart, onWochenchefChange, onNextWeekDataChange,
  mittagsloseTage, planWE, onMittagsloseTageChange, onPlanWEChange, laeden, onLaedenChange,
}: Props) {
  const [view, setView] = useState<View>('overview')
  const [saving, setSaving] = useState(false)
  const [newLaden, setNewLaden] = useState('')
  const [laedenOpen, setLaedenOpen] = useState(false)

  const isChef = currentUser === wochenchef
  const personNames = Object.fromEntries(members.map(m => [m.id, m.name])) as Record<Chef, string>
  const activeMembers = members

  // Rémy Fairplay: person with fewest/oldest chef turns, excluding current chef
  const suggestedNextChef: Chef = ([...activeMembers].sort((a, b) => {
    const aDate = a.chefStat?.lastCook ?? ''
    const bDate = b.chefStat?.lastCook ?? ''
    if (aDate !== bDate) return aDate < bDate ? -1 : 1
    return (a.chefStat?.count ?? 0) - (b.chefStat?.count ?? 0)
  }).find(m => m.id !== wochenchef)?.id ?? activeMembers.find(m => m.id !== wochenchef)?.id ?? activeMembers[0]?.id ?? '') as Chef

  function cookingConflict(tag: string, person: Chef): boolean {
    return weekPlan.some(e => e.tag === tag && e.chef === person)
  }

  function toggleDay(tag: string) {
    const next = shoppingDays.includes(tag)
      ? shoppingDays.filter(d => d !== tag)
      : [...shoppingDays, tag]
    void onShoppingDaysChange(next)
  }

  function assignPerson(tag: string, person: Chef) {
    void onShoppingPersonsChange({ ...shoppingPersons, [tag]: person })
  }

  function proposeEinkaufPerson(tag: string, person: Chef) {
    void onShoppingProposalSubmit({
      id: crypto.randomUUID(),
      type: 'einkauf',
      tag,
      vonChef: currentUser,
      vorgeschlagene: person,
      createdAt: new Date().toISOString(),
    })
  }

  function hasPendingProposal(tag: string): boolean {
    return proposals.some(p => p.type === 'einkauf' && p.tag === tag && p.vonChef === currentUser)
  }

  async function changeWochenchef(chef: Chef) {
    if (saving || chef === wochenchef) return
    setSaving(true)
    try { await onWochenchefChange(chef) } finally { setSaving(false) }
  }

  async function changeNwWochenchef(chef: Chef) {
    if (saving || !onNextWeekDataChange) return
    setSaving(true)
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    try { await onNextWeekDataChange({ wochenchef: chef }, nextMonday) } finally { setSaving(false) }
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  if (view === 'overview') {
    const nwChef = nextWeekData?.wochenchef ?? null
    const activeDays = planWE ? WOCHENTAGE : WOCHENTAGE.slice(0, 5)
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar"><h1>⋯ Mehr</h1></div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          <div className="lbl" style={{ marginTop: 20 }}>Planungseinstellungen</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              onClick={() => {
                const newVal = !planWE
                if (!newVal) onMittagsloseTageChange(mittagsloseTage.filter(t => t !== 'Samstag' && t !== 'Sonntag'))
                onPlanWEChange(newVal)
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}
            >
              <span style={{ fontSize: 13, color: '#111' }}>📅 Wochenende einplanen (Sa + So)</span>
              <div style={{ width: 40, height: 22, borderRadius: 11, flexShrink: 0, background: planWE ? '#1D9E75' : '#ddd', position: 'relative', transition: 'background .2s' }}>
                <div style={{ position: 'absolute', top: 2, left: planWE ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
              </div>
            </div>
            <div style={{ paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>Kein Mittag an diesen Tagen:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeDays.map(tag => {
                  const isOptedOut = mittagsloseTage.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => onMittagsloseTageChange(isOptedOut ? mittagsloseTage.filter(t => t !== tag) : [...mittagsloseTage, tag])}
                      style={{
                        padding: '5px 12px', borderRadius: 16, border: `1px solid ${isOptedOut ? '#9CA3AF' : '#e5e7eb'}`,
                        cursor: 'pointer', fontSize: 12, fontWeight: isOptedOut ? 700 : 400,
                        background: isOptedOut ? '#E5E7EB' : 'white',
                        color: isOptedOut ? '#374151' : '#9CA3AF',
                      }}
                    >
                      {TAG_SHORT[tag]}
                    </button>
                  )
                })}
              </div>
              {mittagsloseTage.filter(t => activeDays.includes(t)).length === 0 && (
                <div style={{ fontSize: 11, color: '#ccc', marginTop: 6 }}>Mittag wird jeden Tag eingeplant</div>
              )}
            </div>
          </div>

          <button
            onClick={onGoToAttendance}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 20, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>👥</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Anwesenheit</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Wer ist wann da diese Woche?</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('einkauf')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>🛒</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Einkaufsmanager</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {shoppingDays.length > 0
                  ? `${shoppingDays.length} Einkaufstag${shoppingDays.length > 1 ? 'e' : ''} diese Woche`
                  : 'Einkaufstage und -personen festlegen'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('wochenchef')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>👨‍🍳</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Wochenchefs</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Diese Woche:{' '}
                <span style={{ color: CFG[wochenchef]?.c ?? '#333', fontWeight: 600 }}>
                  {personNames[wochenchef] ?? wochenchef}
                </span>
                {nwChef && (
                  <> · Nächste:{' '}
                    <span style={{ color: CFG[nwChef]?.c ?? '#333', fontWeight: 600 }}>
                      {personNames[nwChef] ?? nwChef}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

        </div>
      </div>
    )
  }

  // ── Einkaufsmanager ─────────────────────────────────────────────────────────
  if (view === 'einkauf') {
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>🛒 Einkaufsmanager</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          {isChef ? (
            <>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 14, marginTop: 16 }}>
                An welchen Tagen wird diese Woche eingekauft? (Mehrfachauswahl)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {WOCHENTAGE.map(tag => {
                  const active = shoppingDays.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleDay(tag)}
                      style={{
                        padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: active ? 700 : 400,
                        background: active ? '#0F6E56' : '#F3F4F6',
                        color: active ? '#fff' : '#444',
                        transition: 'background 0.15s',
                      }}
                    >
                      {TAG_SHORT[tag]}
                    </button>
                  )
                })}
              </div>

              {shoppingDays.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {shoppingDays.map(tag => {
                    const assigned = shoppingPersons[tag]
                    const missing = !assigned
                    return (
                      <div key={tag} style={{ marginBottom: 12, background: '#F9FAFB', borderRadius: 10, padding: '10px 12px', border: `1px solid ${missing ? '#FCA5A5' : '#e5e7eb'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: missing ? '#DC2626' : '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                          🛒 {tag} — wer kauft ein?
                          {missing && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>*</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {activeMembers.map(m => {
                            const isSelected = assigned === m.id
                            const cc = CFG[m.id] ?? CFG.MA
                            const conflict = isSelected && cookingConflict(tag, m.id as Chef)
                            return (
                              <button
                                key={m.id}
                                onClick={() => assignPerson(tag, m.id as Chef)}
                                style={{
                                  flex: 1, padding: '7px 4px', borderRadius: 8, textAlign: 'center',
                                  cursor: 'pointer', border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                                  background: isSelected ? cc.bg : 'white',
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>
                                  {m.name}
                                </div>
                                {isSelected && !conflict && <div style={{ fontSize: 9, color: cc.c, marginTop: 2 }}>✓</div>}
                                {conflict && <div style={{ fontSize: 9, color: '#DC2626', marginTop: 2 }}>⚠ kocht auch</div>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 16 }}>
              {shoppingDays.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                    Einkaufstage diese Woche — du kannst eine Person vorschlagen:
                  </div>
                  {shoppingDays.map(tag => {
                    const assigned = shoppingPersons[tag]
                    const pending = proposals.find(p => p.type === 'einkauf' && p.tag === tag && p.vonChef === currentUser)
                    return (
                      <div key={tag} style={{ marginBottom: 12, background: '#F9FAFB', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>🛒 {tag}</span>
                          {assigned ? (
                            <span style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>
                              {personNames[assigned]}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#bbb' }}>noch offen</span>
                          )}
                        </div>
                        {pending ? (
                          <div style={{ fontSize: 11, color: '#92400E', background: '#FFFBEB', borderRadius: 6, padding: '5px 8px' }}>
                            ⏳ Dein Vorschlag: {personNames[pending.vorgeschlagene!]} — wartet auf Wochenchef
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Vorschlagen:</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {activeMembers.map(m => {
                                const isAssigned = assigned === m.id
                                const cc = CFG[m.id] ?? CFG.MA
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => !hasPendingProposal(tag) && proposeEinkaufPerson(tag, m.id as Chef)}
                                    disabled={isAssigned}
                                    style={{
                                      flex: 1, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                                      cursor: isAssigned ? 'default' : 'pointer',
                                      border: `1px solid ${isAssigned ? cc.c : '#e5e7eb'}`,
                                      background: isAssigned ? cc.bg : 'white',
                                      opacity: isAssigned ? 0.7 : 1,
                                    }}
                                  >
                                    <div style={{ fontSize: 11, fontWeight: 600, color: isAssigned ? cc.c : '#333' }}>
                                      {m.name}
                                    </div>
                                    {isAssigned && <div style={{ fontSize: 9, color: cc.c }}>✓ aktuell</div>}
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#444', background: '#F9FAFB', borderRadius: 12, padding: '14px 16px' }}>
                  <span style={{ color: '#aaa' }}>Noch keine Einkaufstage festgelegt.</span>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>Nur der Wochenchef kann das ändern.</div>
                </div>
              )}
            </div>
          )}

          {/* Einkaufsläden */}
          <div className="card" style={{ marginTop: 24 }}>
            <button
              onClick={() => setLaedenOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>Einkaufsläden ({laeden.length})</span>
              <span style={{ fontSize: 16, color: '#bbb', lineHeight: 1 }}>{laedenOpen ? '▲' : '▼'}</span>
            </button>
            {laedenOpen && (
              <div style={{ marginTop: 12 }}>
                {laeden.map((l, i) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < laeden.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#111' }}>{l}</span>
                    <button onClick={() => void onLaedenChange(laeden.filter(x => x !== l))} style={{ border: 'none', background: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: laeden.length > 0 ? 10 : 0 }}>
                  <input
                    value={newLaden}
                    onChange={e => setNewLaden(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newLaden.trim() && !laeden.includes(newLaden.trim())) {
                        void onLaedenChange([...laeden, newLaden.trim()])
                        setNewLaden('')
                      }
                    }}
                    placeholder="Laden hinzufügen"
                    style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                  />
                  <button
                    onClick={() => {
                      if (newLaden.trim() && !laeden.includes(newLaden.trim())) {
                        void onLaedenChange([...laeden, newLaden.trim()])
                        setNewLaden('')
                      }
                    }}
                    style={{ border: 'none', background: '#1D9E75', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                  >+</button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    )
  }

  // ── Wochenchefs ─────────────────────────────────────────────────────────────
  if (view === 'wochenchef') {
    const nwChef = nextWeekData?.wochenchef ?? null
    const ccCurrent = CFG[wochenchef] ?? CFG.MA

    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>👨‍🍳 Wochenchefs</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          {/* Aktuelle Woche */}
          <div style={{ marginTop: 20 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Aktuelle Woche</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: ccCurrent.c }}>
                  {personNames[wochenchef] ?? wochenchef}
                </span>
                {currentUser === wochenchef && (
                  <span style={{ fontSize: 10, color: '#1D9E75', background: '#E1F5EE', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>du</span>
                )}
              </div>

              {isChef ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef ändern:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = wochenchef === m.id
                      const cc = CFG[m.id] ?? CFG.MA
                      return (
                        <button
                          key={m.id}
                          onClick={() => void changeWochenchef(m.id as Chef)}
                          disabled={saving}
                          style={{
                            flex: 1, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
                            cursor: saving ? 'default' : 'pointer',
                            border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                            background: isSelected ? cc.bg : 'white',
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>{m.name}</div>
                          {isSelected && <div style={{ fontSize: 10, color: cc.c, marginTop: 2 }}>✓</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  Nur der aktuelle Wochenchef kann das ändern.
                </div>
              )}
            </div>
          </div>

          {/* Nächste Woche */}
          <div style={{ marginTop: 24 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Nächste Woche</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                {nwChef ? (
                  <span style={{ fontSize: 15, fontWeight: 700, color: CFG[nwChef]?.c ?? '#333' }}>
                    {personNames[nwChef] ?? nwChef}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#bbb' }}>noch nicht festgelegt</span>
                )}
              </div>

              {/* Rémy Fairplay-Empfehlung */}
              <div style={{
                fontSize: 11, color: '#555', background: '#F0FAF5',
                border: '1px solid #B2DFCC', borderRadius: 8, padding: '7px 10px', marginTop: 10,
              }}>
                🐀 Rémy empfiehlt:{' '}
                <strong style={{ color: CFG[suggestedNextChef]?.c ?? '#333' }}>
                  {personNames[suggestedNextChef] ?? suggestedNextChef}
                </strong>
                {' '}(war am seltensten Wochenchef)
              </div>

              {isChef ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef festlegen:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = nwChef === m.id
                      const cc = CFG[m.id] ?? CFG.MA
                      return (
                        <button
                          key={m.id}
                          onClick={() => void changeNwWochenchef(m.id as Chef)}
                          disabled={saving}
                          style={{
                            flex: 1, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
                            cursor: saving ? 'default' : 'pointer',
                            border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                            background: isSelected ? cc.bg : 'white',
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>{m.name}</div>
                          {isSelected && <div style={{ fontSize: 10, color: cc.c, marginTop: 2 }}>✓</div>}
                          {m.id === suggestedNextChef && !isSelected && (
                            <div style={{ fontSize: 9, color: '#1D9E75', marginTop: 2 }}>🐀 Tipp</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  Nur der aktuelle Wochenchef kann das festlegen.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    )
  }

  return null
}
