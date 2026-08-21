'use client'
import { useState } from 'react'
import { signIn } from '../lib/auth'
import type { Chef } from '../lib/state'

const CFG: Record<Chef, { bg: string; c: string; name: string }> = {
  PA: { bg: '#E6F1FB', c: '#0C447C', name: 'Heiko' },
  MA: { bg: '#E1F5EE', c: '#0F6E56', name: 'Sabine' },
  TI: { bg: '#FBEAF0', c: '#72243E', name: 'Tim' },
}

export default function LoginScreen() {
  const [selected, setSelected] = useState<Chef | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!selected || !password) return
    setLoading(true)
    setError('')
    const { error } = await signIn(selected, password)
    if (error) {
      setError('Passwort falsch. Bitte nochmal versuchen.')
      setLoading(false)
    }
    // Erfolg: onAuthChange in FamilyPlateApp übernimmt
  }

  return (
    <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 28px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🍽</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>FamilyPlate</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>Wer bist du?</div>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        {(['PA', 'MA', 'TI'] as Chef[]).map(chef => {
          const c = CFG[chef]
          const active = selected === chef
          return (
            <button
              key={chef}
              onClick={() => { setSelected(chef); setPassword(''); setError('') }}
              style={{
                flex: 1, padding: '16px 8px', borderRadius: 14,
                border: `2px solid ${active ? c.c : '#eee'}`,
                background: active ? c.bg : 'white',
                color: active ? c.c : '#bbb',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 5, transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>{chef}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: active ? c.c : '#888' }}>{c.name}</span>
            </button>
          )
        })}
      </div>

      {selected && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
            placeholder="Passwort"
            autoFocus
            style={{
              width: '100%', padding: '13px 14px', fontSize: 15,
              border: '1px solid #ddd', borderRadius: 10, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {error && <div style={{ fontSize: 12, color: '#E24B4A' }}>{error}</div>}
          <button
            onClick={handleLogin}
            disabled={!password || loading}
            className="btn primary"
            style={{ opacity: !password || loading ? 0.5 : 1 }}
          >
            {loading ? '⏳ Anmelden…' : `Als ${CFG[selected].name} anmelden`}
          </button>
        </div>
      )}
    </div>
  )
}
