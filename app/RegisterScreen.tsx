'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const HCaptcha = dynamic(() => import('@hcaptcha/react-hcaptcha'), { ssr: false })

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 14px', fontSize: 15,
  border: '1px solid #ddd', borderRadius: 10, outline: 'none',
  boxSizing: 'border-box',
}

interface Props {
  onBack: () => void
}

export default function RegisterScreen({ onBack }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successEmail, setSuccessEmail] = useState<string | null>(null)

  const canSubmit = !!name && !!email && !!password && !!confirmPassword && !!captchaToken && !loading

  async function handleSubmit() {
    setError('')
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, captchaToken }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Registrierung fehlgeschlagen.')
        setCaptchaKey(k => k + 1)
        setCaptchaToken(null)
      } else {
        setSuccessEmail(email)
      }
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.')
      setCaptchaKey(k => k + 1)
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  if (successEmail) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>📧</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 10 }}>E-Mail gesendet!</div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>
            Wir haben eine Bestätigungsmail an<br />
            <strong>{successEmail}</strong><br />
            geschickt. Bitte klick auf den Link, um<br />dein Konto zu aktivieren.
          </div>
        </div>
        <button onClick={onBack} className="btn" style={{ marginTop: 4 }}>
          Zurück zum Login
        </button>
      </div>
    )
  }

  return (
    <div className="phone" style={{ justifyContent: 'center', gap: 22, padding: '32px 28px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🍽</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Konto erstellen</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>MenuFamPlan</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          placeholder="Dein Name"
          autoComplete="name"
          style={inputStyle}
        />
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError('') }}
          placeholder="E-Mail"
          autoComplete="email"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          placeholder="Passwort (min. 8 Zeichen)"
          autoComplete="new-password"
          style={inputStyle}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => { setConfirmPassword(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
          placeholder="Passwort wiederholen"
          autoComplete="new-password"
          style={inputStyle}
        />

        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
          <HCaptcha
            key={captchaKey}
            sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
            onVerify={t => setCaptchaToken(t)}
            onExpire={() => setCaptchaToken(null)}
            onError={() => { setCaptchaToken(null); setError('Captcha-Fehler. Bitte Seite neu laden.') }}
            size="normal"
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center' }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn primary"
          style={{ opacity: !canSubmit ? 0.5 : 1 }}
        >
          {loading ? '⏳ Konto wird erstellt…' : 'Konto erstellen'}
        </button>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', fontSize: 13, color: '#aaa', cursor: 'pointer', padding: '4px 0' }}
        >
          Bereits ein Konto? Anmelden
        </button>
      </div>
    </div>
  )
}
