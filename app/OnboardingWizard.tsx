'use client'
import { useState } from 'react'
import { saveFamilyProfile, loadFamilyProfile, DEFAULT_MEMBERS } from '../lib/familyLogic'
import type { FamilyMember, FamilyProfile } from '../lib/state'
import { DEFAULT_LAEDEN } from '../lib/state'

const MEMBER_PALETTE = [
  { bg: '#E6F1FB', c: '#0C447C' },
  { bg: '#E1F5EE', c: '#0F6E56' },
  { bg: '#FBEAF0', c: '#72243E' },
  { bg: '#FEF3C7', c: '#92400E' },
]
function memberColor(idx: number) { return MEMBER_PALETTE[idx % MEMBER_PALETTE.length] }

const ALLERGIE_OPTIONS = ['Nüsse', 'Laktose', 'Gluten', 'Fisch', 'Fleisch', 'Meeresfrüchte', 'Eier', 'Soja']
const VORLIEBE_OPTIONS = ['Pasta', 'Pizza', 'Reis-Gerichte', 'Suppen', 'Asiatisch', 'Mediterran', 'Vegetarisch', 'Schnell (<20 Min)']

interface Props {
  onDone: (profile: FamilyProfile) => void
  initialProfile?: FamilyProfile
  onCancel?: () => void
}

export default function OnboardingWizard({ onDone, initialProfile, onCancel }: Props) {
  const [step, setStep] = useState(1)
  const [members, setMembers] = useState<FamilyMember[]>(() => {
    if (!initialProfile) return DEFAULT_MEMBERS
    return initialProfile.members.map(m => ({
      ...m,
      allergien: (m.allergien ?? []).filter(a => ALLERGIE_OPTIONS.includes(a)),
      vorlieben: (m.vorlieben ?? []).filter(v => VORLIEBE_OPTIONS.includes(v)),
    }))
  })
  const [freitext, setFreitext] = useState<Record<string, { a: string; v: string }>>(() => {
    const base = initialProfile ? initialProfile.members : DEFAULT_MEMBERS
    return Object.fromEntries(
      base.map(m => [m.id, {
        a: (m.allergien ?? []).filter(a => !ALLERGIE_OPTIONS.includes(a)).join(', '),
        v: (m.vorlieben ?? []).filter(v => !VORLIEBE_OPTIONS.includes(v)).join(', '),
      }])
    )
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function updateName(id: string, name: string) {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, name } : m))
  }

  function toggle(id: string, field: 'allergien' | 'vorlieben', option: string) {
    setMembers(ms => ms.map(m => {
      if (m.id !== id) return m
      const list = m[field]
      return { ...m, [field]: list.includes(option) ? list.filter(x => x !== option) : [...list, option] }
    }))
  }

  async function finish() {
    setSaving(true)
    setSaveError(null)

    // Guard: if shown without initialProfile (= "new user" flow), verify no real
    // profile exists in DB before writing. A network error during load can cause
    // this wizard to appear over existing data; saving here would overwrite it.
    if (!initialProfile) {
      try {
        const existing = await loadFamilyProfile()
        if (existing) {
          setSaveError('Es existiert bereits ein gespeichertes Profil. Bitte die Seite neu laden – deine Daten sind noch vorhanden.')
          setSaving(false)
          return
        }
      } catch {
        setSaveError('Verbindungsfehler – bitte Seite neu laden und erneut versuchen.')
        setSaving(false)
        return
      }
    }

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
    const profile: FamilyProfile = { members: finalMembers, laeden: initialProfile?.laeden ?? DEFAULT_LAEDEN, zutatenLaden: initialProfile?.zutatenLaden ?? {} }
    try {
      await saveFamilyProfile(profile)
      onDone(profile)
    } catch {
      setSaveError('Speichern fehlgeschlagen – bitte erneut versuchen.')
      setSaving(false)
    }
  }

  const canProceed = step === 1
    ? members.every(m => m.name.trim().length > 0)
    : true

  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px 20px' }}>

      {onCancel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, marginTop: -8 }}>
          <button onClick={onCancel} style={{ fontSize: 13, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
            Abbrechen
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? '#0C447C' : '#eee', transition: 'background .2s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {step === 1 && (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Eure Familie</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Namen der Familienmitglieder</div>
            </div>
            {members.map((m, idx) => {
              const col = memberColor(idx)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: col.bg, color: col.c, fontWeight: 700, fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {idx + 1}
                  </div>
                  <input
                    value={m.name}
                    onChange={e => updateName(m.id, e.target.value)}
                    placeholder="Name"
                    style={{ flex: 1, padding: '12px 14px', fontSize: 15, borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' }}
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
            {members.map((m, idx) => {
              const col = memberColor(idx)
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.c }}>{m.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ALLERGIE_OPTIONS.map(opt => {
                      const active = m.allergien.includes(opt)
                      return (
                        <button key={opt} onClick={() => toggle(m.id, 'allergien', opt)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${active ? col.c : '#ddd'}`, background: active ? col.bg : 'white', color: active ? col.c : '#999' }}>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    placeholder="Weiteres, kommagetrennt"
                    value={freitext[m.id]?.a ?? ''}
                    onChange={e => setFreitext(f => ({ ...f, [m.id]: { ...f[m.id], a: e.target.value } }))}
                    style={{ padding: '9px 12px', fontSize: 13, borderRadius: 10, border: '1px solid #ddd', outline: 'none' }}
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
            {members.map((m, idx) => {
              const col = memberColor(idx)
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.c }}>{m.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {VORLIEBE_OPTIONS.map(opt => {
                      const active = m.vorlieben.includes(opt)
                      return (
                        <button key={opt} onClick={() => toggle(m.id, 'vorlieben', opt)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${active ? col.c : '#ddd'}`, background: active ? col.bg : 'white', color: active ? col.c : '#999' }}>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    placeholder="Weiteres, kommagetrennt"
                    value={freitext[m.id]?.v ?? ''}
                    onChange={e => setFreitext(f => ({ ...f, [m.id]: { ...f[m.id], v: e.target.value } }))}
                    style={{ padding: '9px 12px', fontSize: 13, borderRadius: 10, border: '1px solid #ddd', outline: 'none' }}
                  />
                </div>
              )
            })}
          </>
        )}

      </div>

      {saveError && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>
          ⚠️ {saveError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, paddingTop: 16, borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        {step > 1 && (
          <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 15, fontWeight: 600, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer' }}>
            Zurück
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canProceed} className="btn primary" style={{ flex: 2, opacity: canProceed ? 1 : 0.4 }}>
            Weiter
          </button>
        ) : (
          <button onClick={finish} disabled={saving} className="btn primary" style={{ flex: 2, opacity: saving ? 0.5 : 1 }}>
            {saving ? '⏳ Speichern…' : 'Fertig'}
          </button>
        )}
      </div>
    </div>
  )
}
