'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 14px', fontSize: 15,
  border: '1px solid #ddd', borderRadius: 10, outline: 'none',
  boxSizing: 'border-box',
}

export default function SetupScreen() {
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const meta = session?.user?.user_metadata as { display_name?: string } | undefined
      if (meta?.display_name) setDisplayName(meta.display_name)
    })
  }, [])

  const canSubmit = !!familyName.trim() && !!displayName.trim() && !loading

  async function handleCreate() {
    setError('')
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Sitzung abgelaufen. Bitte neu anmelden.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/create-family', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ familyName: familyName.trim(), displayName: displayName.trim() }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Fehler beim Anlegen der Familie.')
        setLoading(false)
        return
      }

      // Supabase-Auth-Listener neu auslösen → family_members-Eintrag wird gefunden
      // → currentUser wechselt von SETUP_NEEDED zu kuerzel → App lädt vollständig
      await supabase.auth.refreshSession()
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.')
      setLoading(false)
    }
  }

  return (
    <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 28px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🏠</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Familie anlegen</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 8, lineHeight: 1.6 }}>
          Erstelle deine Familie und lade<br />danach Mitglieder ein.
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="lbl">Dein Name in der Familie</div>
        <input
          type="text"
          value={displayName}
          onChange={e => { setDisplayName(e.target.value); setError('') }}
          placeholder="z. B. Heiko"
          autoComplete="given-name"
          style={inputStyle}
        />

        <div className="lbl" style={{ marginTop: 6 }}>Name eurer Familie</div>
        <input
          type="text"
          value={familyName}
          onChange={e => { setFamilyName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && canSubmit && handleCreate()}
          placeholder="z. B. Familie Flechner"
          autoComplete="organization"
          style={inputStyle}
        />

        {error && (
          <div style={{ fontSize: 12, color: '#E24B4A' }}>{error}</div>
        )}

        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="btn primary"
          style={{ opacity: !canSubmit ? 0.5 : 1, marginTop: 4 }}
        >
          {loading ? '⏳ Wird angelegt…' : 'Familie erstellen'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', lineHeight: 1.6 }}>
        Weitere Mitglieder kannst du danach<br />im Profil einladen.
      </div>
    </div>
  )
}
