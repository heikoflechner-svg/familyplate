'use client'
import { useState } from 'react'
import type { Chef, FamilyMember, ChangeProposal, WeekPlanEntry, NextWeekData } from '../lib/state'
import { buildMemberCfg, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { getNextMondayIso } from '../lib/mealLogic'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function getKW(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  const days = Math.round((thu.getTime() - yearStart.getTime()) / 86400000)
  return Math.ceil((days + 1) / 7)
}
const TAG_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
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
  nextWeekData?: NextWeekData | null
  nextWeekStart?: string | null
  onWochenchefChange: (chef: Chef) => Promise<void>
  onNextWeekDataChange?: (data: Partial<NextWeekData>, nextMonday: string) => Promise<void>
  laeden: string[]
  onLaedenChange: (laeden: string[]) => Promise<void>
  canEditSettings: boolean
  memberStatuses?: { kuerzel: string; role: string; isLinked: boolean }[]
}

export default function MehrScreen({
  currentUser, wochenchef, members, weekPlan, shoppingDays, shoppingPersons, proposals,
  onShoppingDaysChange, onShoppingPersonsChange, onShoppingProposalSubmit,
  nextWeekData, nextWeekStart, onWochenchefChange, onNextWeekDataChange,
  laeden, onLaedenChange, canEditSettings,
  memberStatuses = [],
}: Props) {
  const [view, setView] = useState<View>('overview')
  const [saving, setSaving] = useState(false)
  const [newLaden, setNewLaden] = useState('')
  const [laedenOpen, setLaedenOpen] = useState(false)
  const [changingCurrent, setChangingCurrent] = useState(false)
  const [changingNext, setChangingNext] = useState(false)

  const isChef = currentUser === wochenchef
  const personNames = Object.fromEntries(members.map(m => [m.id, m.name])) as Record<Chef, string>
  const activeMembers = members.length ? members : DEFAULT_MEMBERS
  const CFG = buildMemberCfg(activeMembers)

  // Rémy Fairplay: person with fewest/oldest chef turns, excluding current chef and ineligible members
  const eligibleForSuggestion = memberStatuses.length > 0
    ? activeMembers.filter(m => { const s = memberStatuses.find(x => x.kuerzel === m.id); return !!(s?.isLinked && s.role !== 'parent') })
    : []
  const suggestedNextChef: Chef | null = eligibleForSuggestion.length > 0
    ? ([...eligibleForSuggestion].sort((a, b) => {
        const aCount = a.wochenchefStat?.count ?? 0
        const bCount = b.wochenchefStat?.count ?? 0
        if (aCount !== bCount) return aCount - bCount
        const aDate = a.wochenchefStat?.lastWeek ?? ''
        const bDate = b.wochenchefStat?.lastWeek ?? ''
        return aDate < bDate ? -1 : aDate > bDate ? 1 : 0
      }).find(m => m.id !== wochenchef)?.id ?? null)
    : null

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
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar"><h1>⋯ Mehr</h1></div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          <button
            onClick={() => setView('einkauf')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 20, cursor: 'pointer', textAlign: 'left',
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
                {memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === wochenchef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}> (kein Konto)</span>
                )}
                {nwChef && (
                  <> · Nächste:{' '}
                    <span style={{ color: CFG[nwChef]?.c ?? '#333', fontWeight: 600 }}>
                      {personNames[nwChef] ?? nwChef}
                    </span>
                    {memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === nwChef)?.isLinked !== true && (
                      <span style={{ fontSize: 10, color: '#92400E' }}> (kein Konto)</span>
                    )}
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
                            const cc = CFG[m.id] ?? Object.values(CFG)[0]
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
                                const cc = CFG[m.id] ?? Object.values(CFG)[0]
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
                    {canEditSettings && (
                      <button onClick={() => void onLaedenChange(laeden.filter(x => x !== l))} style={{ border: 'none', background: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
                {canEditSettings && (
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
                )}
                {!canEditSettings && laeden.length === 0 && (
                  <div style={{ fontSize: 12, color: '#bbb', paddingTop: 4 }}>Keine Läden eingetragen.</div>
                )}
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
    const ccCurrent = CFG[wochenchef] ?? Object.values(CFG)[0]

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                {members.some(m => m.id === wochenchef)
                  ? <span style={{ fontSize: 15, fontWeight: 700, color: ccCurrent.c }}>{personNames[wochenchef] || wochenchef}</span>
                  : <span style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A' }}>⚠️ {wochenchef || 'nicht gesetzt'}</span>
                }
                {currentUser === wochenchef && (
                  <span style={{ fontSize: 10, color: '#1D9E75', background: '#E1F5EE', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>du</span>
                )}
                {memberStatuses.length > 0 && members.some(m => m.id === wochenchef) && memberStatuses.find(s => s.kuerzel === wochenchef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}>(noch kein Konto)</span>
                )}
                {canEditSettings && !isChef && members.some(m => m.id === wochenchef) && (
                  <button
                    onClick={() => setChangingCurrent(c => !c)}
                    style={{ marginLeft: 'auto', fontSize: 11, color: changingCurrent ? '#1D9E75' : '#888', background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    {changingCurrent ? '× Abbrechen' : '✏️ Ändern'}
                  </button>
                )}
              </div>

              {(isChef || changingCurrent || (canEditSettings && !members.some(m => m.id === wochenchef))) ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef {isChef || changingCurrent ? 'ändern' : 'festlegen'}:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = wochenchef === m.id
                      const cc = CFG[m.id] ?? Object.values(CFG)[0]
                      const hasAccount = memberStatuses.length === 0 || memberStatuses.find(s => s.kuerzel === m.id)?.isLinked === true
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
                          {!hasAccount && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>noch kein Konto</div>}
                          {isSelected && <div style={{ fontSize: 10, color: cc.c, marginTop: 2 }}>✓</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  Ändern können Organisator und Eltern.
                </div>
              )}
            </div>
          </div>

          {/* Fairplay */}
          <div style={{ marginTop: 24 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Fairplay</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              {activeMembers.map((m, i) => {
                const status = memberStatuses.find(s => s.kuerzel === m.id)
                const isEligible = status?.isLinked === true && status.role !== 'parent'
                const cc = CFG[m.id] ?? Object.values(CFG)[0]
                const wcCount = m.wochenchefStat?.count ?? 0
                const chefCount = m.chefStat?.count ?? 0
                const lastWcKW = m.wochenchefStat?.lastWeek ? `KW ${getKW(m.wochenchefStat.lastWeek)}` : '–'
                return (
                  <div key={m.id} style={{ padding: '8px 0', borderBottom: i < activeMembers.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cc.c }}>{m.name}</span>
                      {memberStatuses.length > 0 && !isEligible && (
                        <span style={{ fontSize: 9, color: '#aaa', background: '#f5f5f5', borderRadius: 8, padding: '1px 5px' }}>
                          {status?.isLinked !== true ? 'kein Konto' : 'kein Auto-Vorschlag'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {wcCount}× Wochenchef · {chefCount}× gekocht · zuletzt Wochenchef: {lastWcKW}
                    </div>
                  </div>
                )
              })}
              {suggestedNextChef && (
                <div style={{ fontSize: 11, color: '#555', background: '#F0FAF5', border: '1px solid #B2DFCC', borderRadius: 8, padding: '7px 10px', marginTop: 12 }}>
                  🐀 Rémy empfiehlt <strong style={{ color: CFG[suggestedNextChef]?.c ?? '#333' }}>{personNames[suggestedNextChef] ?? suggestedNextChef}</strong> als nächsten Wochenchef, weil er/sie am seltensten Wochenchef war. Berücksichtigt werden nur Personen mit eigenem Konto, Oma, Opa &amp; Co. ausgenommen.
                </div>
              )}
              {!suggestedNextChef && memberStatuses.length > 0 && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Kein automatischer Vorschlag möglich (keine berechtigten Personen).</div>
              )}
            </div>
          </div>

          {/* Nächste Woche */}
          <div style={{ marginTop: 24 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Nächste Woche</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                {nwChef ? (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 700, color: CFG[nwChef]?.c ?? '#333' }}>
                      {personNames[nwChef] ?? nwChef}
                    </span>
                    {nextWeekData?.wochenchefAutoAssigned && (
                      <span style={{ fontSize: 10, color: '#6B7280' }}>(von Rémy festgelegt)</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: '#bbb' }}>noch nicht festgelegt</span>
                )}
                {nwChef && memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === nwChef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}>(noch kein Konto)</span>
                )}
                {canEditSettings && !isChef && (
                  <button
                    onClick={() => setChangingNext(n => !n)}
                    style={{ marginLeft: 'auto', fontSize: 11, color: changingNext ? '#1D9E75' : '#888', background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    {changingNext ? '× Abbrechen' : '✏️ Ändern'}
                  </button>
                )}
              </div>

              {/* Rémy Fairplay-Empfehlung – nur anzeigen wenn noch kein NW-Chef gesetzt */}
              {suggestedNextChef && !nwChef && (
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
              )}

              {(isChef || changingNext) ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef {nwChef ? 'ändern' : 'festlegen'}:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = nwChef === m.id
                      const cc = CFG[m.id] ?? Object.values(CFG)[0]
                      const hasAccount = memberStatuses.length === 0 || memberStatuses.find(s => s.kuerzel === m.id)?.isLinked === true
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
                          {!hasAccount && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>noch kein Konto</div>}
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
                  Ändern können Organisator und Eltern.
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
