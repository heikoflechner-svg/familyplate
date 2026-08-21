'use client'

interface Props {
  planMittag: boolean
  planWE: boolean
  currentUser: 'PA' | 'MA' | 'TI'
  onPlanMittagChange: (val: boolean) => void
  onPlanWEChange: (val: boolean) => void
  onSignOut: () => Promise<void>
}

const FAMILIE = [
  { kuerzel: 'PA', name: 'Heiko', rolle: 'Wochenchef', bg: '#E6F1FB', c: '#0C447C', info: 'Laktosefrei · mag Pasta' },
  { kuerzel: 'MA', name: 'Sabine', rolle: 'Mitglied', bg: '#E1F5EE', c: '#0F6E56', info: 'Keine Nüsse · mag Fisch' },
  { kuerzel: 'TI', name: 'Tim', rolle: 'Mitglied', bg: '#FBEAF0', c: '#72243E', info: 'Kein Fisch · mag Nudeln' },
]

export default function ProfilScreen({ planMittag, planWE, currentUser, onPlanMittagChange, onPlanWEChange, onSignOut }: Props) {
  return (
    <div className="screen active">
      <div className="topbar"><h1>👤 Profil</h1></div>
      <div className="content">

        <div className="lbl">Wochenplanung</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <Toggle label="☀️ Mittagessen planen (Mo–Fr)" checked={planMittag} onChange={onPlanMittagChange} />
          <Toggle label="📅 Wochenende einplanen (Sa + So)" checked={planWE} onChange={onPlanWEChange} last />
        </div>

        <div className="lbl">Familie</div>
        {FAMILIE.map(p => {
          const isMe = p.kuerzel === currentUser
          return (
            <div key={p.kuerzel} className="profile-person" style={{ opacity: isMe ? 1 : 0.6 }}>
              <div className="profile-person-head">
                <div
                  className="chef-b"
                  style={{ background: p.bg, color: p.c, width: 34, height: 34, fontSize: 11, borderRadius: '50%', outline: isMe ? `2px solid ${p.c}` : 'none', outlineOffset: 2 }}
                >
                  {p.kuerzel}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}{isMe && <span style={{ fontSize: 10, color: p.c, marginLeft: 6, fontWeight: 400 }}>· eingeloggt</span>}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{p.rolle}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>{p.info}</div>
            </div>
          )
        })}

        <button
          onClick={onSignOut}
          style={{ marginTop: 20, width: '100%', padding: '11px', background: 'white', border: '1px solid #eee', borderRadius: 10, fontSize: 13, color: '#888', cursor: 'pointer' }}
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

function Toggle({
  label, checked, onChange, last = false,
}: {
  label: string; checked: boolean; onChange: (val: boolean) => void; last?: boolean
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', padding: '10px 0',
        borderBottom: last ? 'none' : '1px solid #f5f5f5',
      }}
    >
      <span style={{ fontSize: 13, color: '#111' }}>{label}</span>
      <div style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? '#1D9E75' : '#ddd',
        position: 'relative', transition: 'background .2s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </div>
    </div>
  )
}
