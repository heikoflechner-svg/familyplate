'use client'
import { useState } from 'react'
import { signIn } from '../lib/auth'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await signIn(email.trim(), password)
    if (error) {
      setError('E-Mail oder Passwort falsch.')
      setLoading(false)
    }
  }

  return (
    <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 28px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🍽</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>FamilyPlate</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>Bitte anmelden</div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
          placeholder="E-Mail"
          autoComplete="email"
          style={{
            width: '100%', padding: '13px 14px', fontSize: 15,
            border: '1px solid #ddd', borderRadius: 10, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
          placeholder="Passwort"
          autoComplete="current-password"
          style={{
            width: '100%', padding: '13px 14px', fontSize: 15,
            border: '1px solid #ddd', borderRadius: 10, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ fontSize: 12, color: '#E24B4A' }}>{error}</div>}
        <button
          onClick={handleLogin}
          disabled={!email || !password || loading}
          className="btn primary"
          style={{ opacity: !email || !password || loading ? 0.5 : 1 }}
        >
          {loading ? '⏳ Anmelden…' : 'Anmelden'}
        </button>
      </div>
    </div>
  )
}
