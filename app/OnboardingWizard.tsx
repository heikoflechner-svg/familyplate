'use client'
import { useState } from 'react'
import { saveFamilyProfile, DEFAULT_MEMBERS, CHEF_ORDER } from '../lib/familyLogic'
import type { Chef, FamilyMember, FamilyProfile } from '../lib/state'

const CHEF_COLORS: Record<Chef, { bg: string; c: string }> = {
  PA: { bg: '#E6F1FB', c: '#0C447C' },
  MA: { bg: '#E1F5EE', c: '#0F6E56' },
  TI: { bg: '#FBEAF0', c: '#72243E' },
}

const ALLERGIE_OPTIONS = ['Nüsse', 'Laktose', 'Gluten', 'Fisch', 'Fleisch', 'Meeresfrüchte', 'Eier', 'Soja']
const VORLIEBE_OPTIONS = ['Pasta', 'Pizza', 'Reis-Gerichte', 'Suppen', 'Asiatisch', 'Mediterran', 'Vegetarisch', 'Schnell (<20 Min)']

interface Props {
  onDone: (profile: FamilyProfile) => void
}

export default function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState(1)
  const [members, setMembers] = useState<FamilyMember[]>(DEFAULT_MEMBERS)
  const [freitext, setFreitext] = useState<Record<Chef, { a: string; v: string }>>({
    PA: { a: '', v: '' },
    MA: { a: '', v: '' },
    TI: { a: '', v: '' },
  })
  const [saving, setSaving] = useState(false)

  function updateName(id: Chef, name: string) {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, name } : m))
  }

  function toggle(id: Chef, field: 'allergien' | 'vorlieben', option: string) {
    setMembers(ms => ms.map(m => {
      if (m.id !== id) return m
      const list = m[field]
      return { ...m, [field]: list.includes(option) ? list.filter(x => x !== option) : [...list, option] }
    }))
  }

  async function finish() {
    setSaving(true)
    const finalMembers = members.map(m => ({
      ...m,
      allergien: [
        ...m.allergien,
        ...freitext[m.id].a.split(',').map(s => s.trim()).filter(Boolean),
      ],
      vorlieben: [
        ...m.vorlieben,
        ...freitext[m.id].v.split(',').map(s => s.trim()).filter(Boolean),
      ],
    }))
    const profile: FamilyProfile = { members: finalMembers }
    await saveFamilyProfile(profile)
    onDone(profile)
  }

  const canProceed = step === 1
    ? members.every(m => m.name.trim().length > 0)
    : true

  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px 20px' }}>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s <= step ? '#0C447C' : '#eee',
            transition: 'background .2s',
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {step === 1 && (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Eure Familie</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Namen der Familienmitglieder</div>
            </div>
            {CHEF_ORDER.map(id => {
              const m = members.find(m => m.id === id)!
              const col = CHEF_COLORS[id]
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: col.bg, color: col.c,
                    fontWeight: 700, fontSize: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{id}</div>
                  <input
                    value={m.name}
                    onChange={e => updateName(id, e.target.value)}
                    placeholder="Name"
                    style={{
                      flex: 1, padding: '12px 14px', fontSize: 15, borderRadius: 10,
                      border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )
            })}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Allergien & Unverträglichkeiten</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Was verträgt wer nicht?</div>
            </div>
            {CHEF_ORDER.map(id => {
              const m = members.find(m => m.id === id)!
              const col = CHEF_COLORS[id]
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.c }}>{m.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ALLERGIE_OPTIONS.map(opt => {
                      const active = m.allergien.includes(opt)
                      return (
                        <button key={opt} onClick={() => toggle(id, 'allergien', opt)} style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${active ? col.c : '#ddd'}`,
                          background: active ? col.bg : 'white',
                          color: active ? col.c : '#999',
                        }}>{opt}</button>
                      )
                    })}
                  </div>
                  <input
                    placeholder="Weiteres, kommagetrennt"
                    value={freitext[id].a}
                    onChange={e => setFreitext(f => ({ ...f, [id]: { ...f[id], a: e.target.value } }))}
                    style={{
                      padding: '9px 12px', fontSize: 13, borderRadius: 10,
                      border: '1px solid #ddd', outline: 'none',
                    }}
                  />
                </div>
              )
            })}
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Geschmackliche Vorlieben</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Was mögt ihr besonders?</div>
            </div>
            {CHEF_ORDER.map(id => {
              const m = members.find(m => m.id === id)!
              const col = CHEF_COLORS[id]
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.c }}>{m.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {VORLIEBE_OPTIONS.map(opt => {
                      const active = m.vorlieben.includes(opt)
                      return (
                        <button key={opt} onClick={() => toggle(id, 'vorlieben', opt)} style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${active ? col.c : '#ddd'}`,
                          background: active ? col.bg : 'white',
                          color: active ? col.c : '#999',
                        }}>{opt}</button>
                      )
                    })}
                  </div>
                  <input
                    placeholder="Weiteres, kommagetrennt"
                    value={freitext[id].v}
                    onChange={e => setFreitext(f => ({ ...f, [id]: { ...f[id], v: e.target.value } }))}
                    style={{
                      padding: '9px 12px', fontSize: 13, borderRadius: 10,
                      border: '1px solid #ddd', outline: 'none',
                    }}
                  />
                </div>
              )
            })}
          </>
        )}

      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 15, fontWeight: 600,
              border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer',
            }}
          >
            Zurück
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed}
            className="btn primary"
            style={{ flex: 2, opacity: canProceed ? 1 : 0.4 }}
          >
            Weiter
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={saving}
            className="btn primary"
            style={{ flex: 2, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '⏳ Speichern…' : '🎉 Los geht\'s!'}
          </button>
        )}
      </div>
    </div>
  )
}
