'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 14px', fontSize: 15,
  border: '1px solid #ddd', borderRadius: 10, outline: 'none', boxSizing: 'border-box',
}

interface InviteInfo {
  familyName: string
  personName: string
  email: string
  expiresAt: string
  invitedRole: string
}

function roleLabelDisplay(role: string): string {
  if (role === 'admin') return 'Eltern'
  if (role === 'parent') return 'Oma, Opa & Co.'
  return 'Mitglied'
}

function roleHint(role: string): string {
  if (role === 'admin') return 'Verwalten die Familie mit: alle Profile, Einladungen, Rollen und Einstellungen.'
  if (role === 'parent') return 'Z. B. Großeltern, Au-pair: eigenes Profil und die Profile der Kinder.'
  return 'Bearbeitet nur das eigene Profil.'
}

type PageState = 'loading' | 'error' | 'ready'
type FormMode = 'new-user' | 'login'

function InvitationContent() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('new-user')

  const [password, setPassword] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setErrorMsg('Kein Einladungstoken in der URL gefunden.')
      setPageState('error')
      return
    }
    async function init() {
      const [infoRes, { data: { session } }] = await Promise.all([
        fetch(`/api/invitations/info?token=${encodeURIComponent(token)}`),
        supabase.auth.getSession(),
      ])
      const info = await infoRes.json() as InviteInfo & { error?: string }
      if (!infoRes.ok) {
        setErrorMsg(info.error ?? 'Ungültiger Einladungslink.')
        setPageState('error')
        return
      }
      setInviteInfo(info)
      if (session) {
        setIsLoggedIn(true)
        setLoginEmail(session.user.email ?? info.email)
      } else {
        setLoginEmail(info.email)
      }
      setPageState('ready')
    }
    void init()
  }, [token])

  async function handleNewUser() {
    if (!inviteInfo) return
    setSubmitting(true)
    setSubmitError('')
    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!res.ok) {
      setSubmitError(data.error ?? 'Fehler beim Beitreten.')
      setSubmitting(false)
      return
    }
    // Sign in with the newly created account
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: inviteInfo.email,
      password,
    })
    if (signInError) {
      setSubmitError('Konto erstellt, aber Anmeldung fehlgeschlagen. Bitte manuell einloggen.')
      setSubmitting(false)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/'), 1500)
  }

  async function handleLogin() {
    if (!inviteInfo) return
    setSubmitting(true)
    setSubmitError('')
    const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
      email: inviteInfo.email,
      password: loginPassword,
    })
    if (signInError || !session) {
      setSubmitError('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.')
      setSubmitting(false)
      return
    }
    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token }),
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!res.ok) {
      setSubmitError(data.error ?? 'Fehler beim Beitreten.')
      setSubmitting(false)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/'), 1500)
  }

  async function handleLoggedInAccept() {
    if (!inviteInfo) return
    setSubmitting(true)
    setSubmitError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setIsLoggedIn(false)
      setSubmitting(false)
      return
    }
    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token }),
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!res.ok) {
      setSubmitError(data.error ?? 'Fehler beim Beitreten.')
      setSubmitting(false)
      return
    }
    await supabase.auth.refreshSession()
    setSuccess(true)
    setTimeout(() => router.push('/'), 1500)
  }

  if (pageState === 'loading') {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🐀</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Lade Einladung…</div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#991B1B' }}>Einladung nicht gültig</div>
        <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{errorMsg}</div>
        <button
          onClick={() => router.push('/')}
          style={{ marginTop: 8, padding: '11px 28px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Zur App
        </button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Willkommen in der Familie!</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Weiterleitung…</div>
      </div>
    )
  }

  return (
    <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 24, padding: '0 28px', textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🍽</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Du wurdest eingeladen</div>
        <div style={{ marginTop: 10, fontSize: 14, color: '#555', lineHeight: 1.7 }}>
          Du trittst der Familie <strong>{inviteInfo!.familyName}</strong> bei<br />
          als <strong>{inviteInfo!.personName}</strong>.
        </div>
        <div style={{ marginTop: 8, padding: '8px 14px', background: '#F0F9F5', borderRadius: 10, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>
            Rolle: {roleLabelDisplay(inviteInfo!.invitedRole)}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2, lineHeight: 1.4 }}>
            {roleHint(inviteInfo!.invitedRole)}
          </div>
        </div>
      </div>

      {isLoggedIn ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>Du bist eingeloggt als {loginEmail}</div>
          {submitError && <div style={{ fontSize: 12, color: '#E24B4A' }}>{submitError}</div>}
          <button
            onClick={handleLoggedInAccept}
            disabled={submitting}
            style={{ padding: '13px', background: submitting ? '#ccc' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
          >
            {submitting ? '⏳ Wird bearbeitet…' : 'Einladung annehmen'}
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); setIsLoggedIn(false); setFormMode('login') }}
            style={{ padding: '10px', background: 'none', border: '1px solid #eee', borderRadius: 10, fontSize: 13, color: '#888', cursor: 'pointer' }}
          >
            Mit anderem Konto anmelden
          </button>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: 16 }}>
            {(['new-user', 'login'] as FormMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => { setFormMode(mode); setSubmitError('') }}
                style={{
                  flex: 1, padding: '9px 0', fontSize: 13, fontWeight: formMode === mode ? 600 : 400,
                  color: formMode === mode ? '#1D9E75' : '#aaa',
                  background: 'none', border: 'none', borderBottom: formMode === mode ? '2px solid #1D9E75' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: -1,
                }}
              >
                {mode === 'new-user' ? 'Neu hier' : 'Ich habe ein Konto'}
              </button>
            ))}
          </div>

          {submitError && <div style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{submitError}</div>}

          {formMode === 'new-user' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ ...inputStyle, background: '#f5f5f5', color: '#888', display: 'flex', alignItems: 'center' }}>
                {inviteInfo!.email}
              </div>
              <input
                type="password"
                placeholder="Passwort wählen (mind. 8 Zeichen)"
                value={password}
                onChange={e => { setPassword(e.target.value); setSubmitError('') }}
                autoComplete="new-password"
                style={inputStyle}
              />
              <button
                onClick={handleNewUser}
                disabled={submitting || password.length < 8}
                style={{ padding: '13px', background: (submitting || password.length < 8) ? '#ccc' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: (submitting || password.length < 8) ? 'default' : 'pointer', marginTop: 4 }}
              >
                {submitting ? '⏳ Wird erstellt…' : 'Konto erstellen & beitreten'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ ...inputStyle, background: '#f5f5f5', color: '#888', display: 'flex', alignItems: 'center' }}>
                {inviteInfo!.email}
              </div>
              <input
                type="password"
                placeholder="Passwort"
                value={loginPassword}
                onChange={e => { setLoginPassword(e.target.value); setSubmitError('') }}
                autoComplete="current-password"
                style={inputStyle}
              />
              <button
                onClick={handleLogin}
                disabled={submitting || !loginPassword}
                style={{ padding: '13px', background: (submitting || !loginPassword) ? '#ccc' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: (submitting || !loginPassword) ? 'default' : 'pointer', marginTop: 4 }}
              >
                {submitting ? '⏳ Wird angemeldet…' : 'Anmelden & beitreten'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EinladungPage() {
  return (
    <Suspense
      fallback={
        <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ fontSize: 40 }}>🐀</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>Lade…</div>
        </div>
      }
    >
      <InvitationContent />
    </Suspense>
  )
}
