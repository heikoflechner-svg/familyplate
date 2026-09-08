'use client'
import type { Chef, FamilyMember, ChangeProposal, WeekPlanEntry } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const TAG_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
}

const CFG: Record<Chef, { bg: string; c: string }> = {
  PA: { bg: '#E6F1FB', c: '#0C447C' },
  MA: { bg: '#E1F5EE', c: '#0F6E56' },
  TI: { bg: '#FBEAF0', c: '#72243E' },
}

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
}

export default function MehrScreen({
  currentUser, wochenchef, members, weekPlan, shoppingDays, shoppingPersons, proposals,
  onShoppingDaysChange, onShoppingPersonsChange, onShoppingProposalSubmit, onGoToAttendance,
}: Props) {
  const isChef = currentUser === wochenchef
  const personNames = Object.fromEntries(members.map(m => [m.id, m.name])) as Record<Chef, string>
  const activeMembers = members.filter(m => ['PA', 'MA', 'TI'].includes(m.id))

  function cookingConflict(tag: string, person: Chef): boolean {
    return weekPlan.some(e => e.tag === tag && e.chef === person)
  }

  function toggleDay(tag: string) {
    const next = shoppingDays.includes(tag)
      ? shoppingDays.filter(d => d !== tag)
      : [...shoppingDays, tag]
    onShoppingDaysChange(next)
  }

  function assignPerson(tag: string, person: Chef) {
    onShoppingPersonsChange({ ...shoppingPersons, [tag]: person })
  }

  function proposeEinkaufPerson(tag: string, person: Chef) {
    onShoppingProposalSubmit({
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

  return (
    <div className="screen active" style={{ overflowY: 'auto' }}>
      <div className="topbar"><h1>⋯ Mehr</h1></div>
      <div className="content" style={{ padding: '0 16px 24px' }}>

        {/* Anwesenheit */}
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

        {/* Einkaufsmanager */}
        <div style={{ marginTop: 28 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>🛒 Einkaufsmanager</div>

          {isChef ? (
            <>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
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

              {/* Person-Zuordnung pro Einkaufstag (Wochenchef: direkte Zuweisung) */}
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
                            const cc = CFG[m.id as Chef] ?? CFG.MA
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
            /* Nicht-Wochenchef: Vorschlag pro Einkaufstag */
            <div>
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
                                const cc = CFG[m.id as Chef] ?? CFG.MA
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
        </div>

      </div>
    </div>
  )
}
