'use client'
import type { Chef } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const TAG_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
}

interface Props {
  currentUser: Chef
  wochenchef: Chef
  shoppingDays: string[]
  onShoppingDaysChange: (days: string[]) => Promise<void>
  onGoToAttendance: () => void
}

export default function MehrScreen({ currentUser, wochenchef, shoppingDays, onShoppingDaysChange, onGoToAttendance }: Props) {
  const isChef = currentUser === wochenchef

  function toggleDay(tag: string) {
    const next = shoppingDays.includes(tag)
      ? shoppingDays.filter(d => d !== tag)
      : [...shoppingDays, tag]
    onShoppingDaysChange(next)
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
              {shoppingDays.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 13, color: '#0F6E56', fontWeight: 600 }}>
                  ✅ Diese Woche: {shoppingDays.join(', ')}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#444', background: '#F9FAFB', borderRadius: 12, padding: '14px 16px' }}>
              {shoppingDays.length > 0
                ? <>Einkaufstage diese Woche: <strong>{shoppingDays.join(', ')}</strong></>
                : <span style={{ color: '#aaa' }}>Noch keine Einkaufstage festgelegt.</span>
              }
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>Nur der Wochenchef kann das ändern.</div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
