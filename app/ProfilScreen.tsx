'use client'
import { useEffect, useState } from 'react'
import type { Chef, FamilyMember, FamilyProfile, MemberRole } from '../lib/state'
import { changePassword } from '../lib/auth'
import { supabase } from '../lib/supabase'

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

function roleLabelDisplay(role: MemberRole): string {
  if (role === 'owner') return 'Gründer'
  if (role === 'admin') return 'Mitverwaltung'
  if (role === 'parent') return 'Elternteil'
  return 'Mitglied'
}

interface PendingInvite {
  id: string
  kuerzel: string
  email: string
  invitedRole: string
}

interface Props {
  currentUser: Chef
  familyProfile: FamilyProfile
  currentMemberRole: MemberRole
  onSignOut: () => Promise<void>
  onEditProfile: (profile: FamilyProfile) => void
}

export default function ProfilScreen({
  currentUser, familyProfile, currentMemberRole,
  onSignOut, onEditProfile,
}: Props) {
  // Password-change state
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  // memberRoles: kuerzel → role for every linked family member
  const [memberRoles, setMemberRoles] = useState<Record<string, MemberRole>>({})
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteDataKey, setInviteDataKey] = useState(0)

  // Role change state
  const [roleChangePending, setRoleChangePending] = useState<string | null>(null)
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null)
  const [editProfileError, setEditProfileError] = useState<string | null>(null)

  const [inviteOpenFor, setInviteOpenFor] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'parent' | 'admin'>('member')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)

  const maxCount = Math.max(...familyProfile.members.map(m => m.chefStat?.count ?? 0), 1)

  // Derived from memberRoles
  const currentRole: MemberRole = memberRoles[currentUser] ?? 'member'
  const linkedKuerzel = Object.keys(memberRoles)
  const canManage = currentRole === 'owner' || currentRole === 'admin'

  useEffect(() => {
    async function loadInviteData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const token = session.access_token

      const [membersData, invitesData] = await Promise.all([
        fetch('/api/members/list', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() as Promise<{ members: { kuerzel: string; role: string }[] }> : { members: [] }),
        fetch('/api/invitations', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : { invitations: [] }),
      ])

      const roles: Record<string, MemberRole> = {}
      for (const m of ((membersData as { members?: { kuerzel: string; role: string }[] }).members ?? [])) {
        roles[m.kuerzel] = m.role as MemberRole
      }
      setMemberRoles(roles)
      setPendingInvites((invitesData as { invitations?: PendingInvite[] }).invitations ?? [])
    }
    void loadInviteData()
  }, [currentUser, inviteDataKey])

  function resetPwForm() {
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError(null); setPwSuccess(false)
  }

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function handleSendInvite(kuerzel: string) {
    if (!inviteEmail) return
    setInviteSending(true)
    setInviteError(null)
    const token = await getToken()
    if (!token) { setInviteError('Sitzung abgelaufen.'); setInviteSending(false); return }
    const res = await fetch('/api/invitations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: inviteEmail, targetKuerzel: kuerzel, invitedRole: inviteRole }),
    })
    const data = await res.json() as { error?: string }
    setInviteSending(false)
    if (!res.ok) {
      setInviteError(data.error ?? 'Fehler beim Senden.')
    } else {
      setInviteSuccess(`Einladung an ${inviteEmail} gesendet.`)
      setInviteOpenFor(null)
      setInviteDataKey(k => k + 1)
      setTimeout(() => setInviteSuccess(null), 4000)
    }
  }

  async function handleRevoke(inviteId: string) {
    setActionPending(inviteId)
    const token = await getToken()
    if (!token) { setActionPending(null); return }
    const res = await fetch('/api/invitations/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inviteId }),
    })
    setActionPending(null)
    if (res.ok) setInviteDataKey(k => k + 1)
  }

  async function handleResend(invite: PendingInvite) {
    setActionPending(invite.id)
    const token = await getToken()
    if (!token) { setActionPending(null); return }

    const revokeRes = await fetch('/api/invitations/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inviteId: invite.id }),
    })
    if (!revokeRes.ok) { setActionPending(null); return }

    const sendRes = await fetch('/api/invitations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: invite.email, targetKuerzel: invite.kuerzel, invitedRole: invite.invitedRole }),
    })
    setActionPending(null)
    if (sendRes.ok) {
      setInviteSuccess(`Einladung erneut an ${invite.email} gesendet.`)
      setInviteDataKey(k => k + 1)
      setTimeout(() => setInviteSuccess(null), 4000)
    }
  }

  async function handleRoleChange(kuerzel: string, newRole: 'member' | 'parent' | 'admin') {
    setRoleChangePending(kuerzel)
    const token = await getToken()
    if (!token) { setRoleChangePending(null); return }
    const res = await fetch('/api/members/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetKuerzel: kuerzel, newRole }),
    })
    setRoleChangePending(null)
    if (res.ok) {
      setMemberRoles(r => ({ ...r, [kuerzel]: newRole }))
    } else {
      const err = await res.json().catch(() => ({})) as { error?: string }
      setRoleChangeError(err.error ?? 'Rollenänderung fehlgeschlagen.')
      setTimeout(() => setRoleChangeError(null), 4000)
    }
  }

  function handleEditProfile() {
    let editableMembers: FamilyMember[]
    if (currentMemberRole === 'owner' || currentMemberRole === 'admin') {
      editableMembers = familyProfile.members
    } else if (currentMemberRole === 'parent') {
      editableMembers = familyProfile.members.filter(m => m.id === currentUser || m.istKind)
    } else {
      editableMembers = familyProfile.members.filter(m => m.id === currentUser)
    }
    if (editableMembers.length === 0) {
      setEditProfileError('Profil konnte nicht geladen werden – bitte Seite neu laden.')
      return
    }
    setEditProfileError(null)
    onEditProfile({ ...familyProfile, members: editableMembers })
  }

  return (
    <div className="screen active">
      <div className="topbar"><h1>👤 Profil</h1></div>
      <div className="content">

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="lbl" style={{ marginBottom: 0 }}>Familie</div>
          <button
            onClick={handleEditProfile}
            style={{ fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
          >
            ✏️ Bearbeiten
          </button>
        </div>

        {editProfileError && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#991B1B', marginBottom: 10 }}>
            ⚠️ {editProfileError}
          </div>
        )}

        {roleChangeError && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#991B1B', marginBottom: 10 }}>
            ⚠️ {roleChangeError}
          </div>
        )}

        {inviteSuccess && (
          <div style={{ background: '#E1F5EE', border: '1px solid #A7D7C5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#085041', marginBottom: 12 }}>
            ✓ {inviteSuccess}
          </div>
        )}

        {familyProfile.members.map((m, idx) => {
          const col = MEMBER_PALETTE[idx % MEMBER_PALETTE.length]
          const isMe = m.id === currentUser
          const allergienText = (m.allergien ?? []).length ? (m.allergien ?? []).join(', ') : null
          const vorliebText = (m.vorlieben ?? []).length ? (m.vorlieben ?? []).join(', ') : null
          const stat = m.chefStat
          const barPct = stat ? Math.round((stat.count / maxCount) * 100) : 0
          const memberRole = memberRoles[m.id]
          const isLinked = linkedKuerzel.includes(m.id)
          const pendingInvite = pendingInvites.find(i => i.kuerzel === m.id)
          const inviteFormOpen = inviteOpenFor === m.id
          const isBusy = actionPending === (pendingInvite?.id ?? '')

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
                  <div style={{ fontSize: 11, color: '#aaa' }}>
                    {isLinked && memberRole ? roleLabelDisplay(memberRole) : isLinked ? 'Mitglied' : 'Kein Konto'}
                  </div>
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

              {/* Invite/role section – canManage only, not for own card */}
              {canManage && !isMe && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                  {isLinked ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#aaa' }}>✓ Konto verknüpft</div>
                      {memberRole !== 'owner' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#aaa' }}>Rolle:</span>
                          <select
                            value={memberRole ?? 'member'}
                            disabled={roleChangePending === m.id}
                            onChange={e => void handleRoleChange(m.id, e.target.value as 'member' | 'parent' | 'admin')}
                            style={{ fontSize: 11, border: '1px solid #ddd', borderRadius: 6, padding: '2px 6px', color: '#555', background: '#fff', cursor: 'pointer' }}
                          >
                            <option value="member">Mitglied</option>
                            <option value="parent">Elternteil</option>
                            <option value="admin">Mitverwaltung</option>
                          </select>
                          {roleChangePending === m.id && <span style={{ fontSize: 11, color: '#aaa' }}>…</span>}
                        </div>
                      )}
                    </div>
                  ) : pendingInvite ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '3px 8px', flexShrink: 0 }}>
                        ✉ Einladung ausstehend
                      </div>
                      <button
                        disabled={isBusy}
                        onClick={() => handleRevoke(pendingInvite.id)}
                        style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: isBusy ? 'default' : 'pointer', padding: '2px 0' }}
                      >
                        {isBusy ? '…' : 'Zurückziehen'}
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => handleResend(pendingInvite)}
                        style={{ fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: isBusy ? 'default' : 'pointer', padding: '2px 0' }}
                      >
                        {isBusy ? '' : 'Erneut senden'}
                      </button>
                    </div>
                  ) : !inviteFormOpen ? (
                    <button
                      onClick={() => { setInviteOpenFor(m.id); setInviteEmail(''); setInviteRole('member'); setInviteError(null) }}
                      style={{ fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                    >
                      ✉ Einladen
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="email"
                        placeholder={`E-Mail von ${m.name}`}
                        value={inviteEmail}
                        onChange={e => { setInviteEmail(e.target.value); setInviteError(null) }}
                        autoFocus
                        style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {(['member', 'parent', 'admin'] as const).map(r => (
                          <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555', cursor: 'pointer' }}>
                            <input type="radio" name={`role-${m.id}`} value={r} checked={inviteRole === r} onChange={() => setInviteRole(r)} />
                            {r === 'member' ? 'Mitglied' : r === 'parent' ? 'Elternteil' : 'Mitverwaltung'}
                          </label>
                        ))}
                      </div>
                      {inviteError && <div style={{ fontSize: 11, color: '#E24B4A' }}>{inviteError}</div>}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          disabled={inviteSending || !inviteEmail}
                          onClick={() => handleSendInvite(m.id)}
                          style={{ flex: 1, padding: '8px', background: (inviteSending || !inviteEmail) ? '#ccc' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: (inviteSending || !inviteEmail) ? 'default' : 'pointer' }}
                        >
                          {inviteSending ? '…' : 'Senden'}
                        </button>
                        <button
                          onClick={() => { setInviteOpenFor(null); setInviteError(null) }}
                          style={{ padding: '8px 12px', background: 'none', border: '1px solid #eee', borderRadius: 8, fontSize: 12, color: '#888', cursor: 'pointer' }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
          MenuFamPlan · Powered by Rémy 🐀
        </div>

      </div>
    </div>
  )
}
