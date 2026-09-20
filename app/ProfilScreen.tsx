'use client'
import { useState } from 'react'
import type { Chef, FamilyProfile } from '../lib/state'
import { changePassword } from '../lib/auth'

const MEMBER_PALETTE = [
  { bg: '#E6F1FB', c: '#0C447C' },
  { bg: '#E1F5EE', c: '#0F6E56' },
  { bg: '#FBEAF0', c: '#72243E' },
  { bg: '#FEF3C7', c: '#92400E' },
]

function formatLastCook(iso: string | null | undefined): string {
  if (!iso) return 'noch nie'
  const date = new Date(iso)
  const today = new Date()
  const diff = Math.floor((today.getTime() - date.getTime()) / 86400000)
  if (diff === 0) return 'heute'
  if (diff === 1) return 'gestern'
  if (diff < 7) return `vor ${diff} Tagen`
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

interface Props {
  currentUser: Chef
  familyProfile: FamilyProfile
  onSignOut: () => Promise<void>
  onEditProfile: () => void
}

export default function ProfilScreen({
  currentUser, familyProfile,
  onSignOut, onEditProfile,
}: Props) {
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const maxCount = Math.max(...familyProfile.members.map(m => m.chefStat?.count ?? 0), 1)

  function resetPwForm() {
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError(null); setPwSuccess(false)
  }

  return (
    <div className="screen active">
      <div className="topbar"><h1>👤 Profil</h1></div>
      <div className="content">

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="lbl" style={{ marginBottom: 0 }}>Familie</div>
          <button
            onClick={onEditProfile}
            style={{ fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
          >
            ✏️ Bearbeiten
          </button>
        </div>

        {familyProfile.members.map((m, idx) => {
          const col = MEMBER_PALETTE[idx % MEMBER_PALETTE.length]
          const isMe = m.id === currentUser
          const allergienText = (m.allergien ?? []).length ? (m.allergien ?? []).join(', ') : null
          const vorliebText = (m.vorlieben ?? []).length ? (m.vorlieben ?? []).join(', ') : null
          const stat = m.chefStat
          const barPct = stat ? Math.round((stat.count / maxCount) * 100) : 0

          return (
            <div key={m.id} className="profile-person" style={{ opacity: isMe ? 1 : 0.75 }}>
              <div className="profile-person-head">
                <div
                  className="chef-b"
                  style={{
                    background: col.bg, color: col.c,
                    width: 34, height: 34, fontSize: 11, borderRadius: '50%',
                    outline: isMe ? `2px solid ${col.c}` : 'none', outlineOffset: 2,
                  }}
                >
                  {m.id}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {m.name}
                    {isMe && <span style={{ fontSize: 10, color: col.c, marginLeft: 6, fontWeight: 400 }}>· eingeloggt</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>Mitglied</div>
                </div>
                {stat && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: col.c }}>{stat.count}×</div>
                    <div style={{ fontSize: 10, color: '#bbb' }}>{formatLastCook(stat.lastCook)}</div>
                  </div>
                )}
              </div>

              {stat && stat.count > 0 && (
                <div style={{ marginTop: 8, marginBottom: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: col.c, borderRadius: 2, transition: 'width .3s' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {allergienText && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    <span style={{ color: '#c0392b' }}>✗</span> {allergienText}
                  </div>
                )}
                {vorliebText && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    <span style={{ color: '#27ae60' }}>♥</span> {vorliebText}
                  </div>
                )}
                {!allergienText && !vorliebText && (
                  <div style={{ fontSize: 12, color: '#ccc' }}>Keine Angaben</div>
                )}
              </div>
            </div>
          )
        })}

        <div className="card" style={{ marginBottom: 12, marginTop: 24 }}>
          <button
            onClick={() => { setPwOpen(o => !o); resetPwForm() }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>🔑 Passwort ändern</span>
            <span style={{ fontSize: 16, color: '#bbb', lineHeight: 1 }}>{pwOpen ? '▲' : '▼'}</span>
          </button>
          {pwOpen && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pwSuccess ? (
                <div style={{ color: '#1D9E75', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                  ✓ Passwort wurde geändert
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    placeholder="Aktuelles Passwort"
                    value={currentPw}
                    onChange={e => { setCurrentPw(e.target.value); setPwError(null) }}
                    autoComplete="current-password"
                    style={{ border: '1px solid #ddd', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                  />
                  <input
                    type="password"
                    placeholder="Neues Passwort (min. 8 Zeichen)"
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwError(null) }}
                    autoComplete="new-password"
                    style={{ border: '1px solid #ddd', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                  />
                  <input
                    type="password"
                    placeholder="Neues Passwort wiederholen"
                    value={confirmPw}
                    onChange={e => { setConfirmPw(e.target.value); setPwError(null) }}
                    autoComplete="off"
                    style={{ border: '1px solid #ddd', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                  />
                  {pwError && (
                    <div style={{ color: '#c0392b', fontSize: 12 }}>{pwError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={pwSaving}
                      onClick={async () => {
                        if (!currentPw) { setPwError('Bitte aktuelles Passwort eingeben'); return }
                        if (newPw.length < 8) { setPwError('Neues Passwort muss mindestens 8 Zeichen haben'); return }
                        if (newPw !== confirmPw) { setPwError('Neue Passwörter stimmen nicht überein'); return }
                        setPwSaving(true); setPwError(null)
                        const { error } = await changePassword(currentPw, newPw)
                        setPwSaving(false)
                        if (error) { setPwError(error) } else { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
                      }}
                      style={{ flex: 1, padding: '10px', background: pwSaving ? '#ccc' : '#0C447C', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, cursor: pwSaving ? 'default' : 'pointer' }}
                    >
                      {pwSaving ? '…' : 'Passwort ändern'}
                    </button>
                    <button
                      onClick={() => { setPwOpen(false); resetPwForm() }}
                      style={{ padding: '10px 14px', background: 'none', border: '1px solid #eee', borderRadius: 10, fontSize: 13, color: '#888', cursor: 'pointer' }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onSignOut}
          style={{ marginTop: 8, width: '100%', padding: '11px', background: 'white', border: '1px solid #eee', borderRadius: 10, fontSize: 13, color: '#888', cursor: 'pointer' }}
        >
          Abmelden
        </button>

        <div style={{ marginTop: 16, fontSize: 11, color: '#ccc', textAlign: 'center' }}>
          FamilyPlate · Powered by Rémy 🐀
        </div>

      </div>
    </div>
  )
}
