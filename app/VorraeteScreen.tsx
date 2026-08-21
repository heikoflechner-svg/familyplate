'use client'
import { useState } from 'react'
import {
  addFreezerItem,
  deleteFreezerItem,
  addPantryItem,
  deletePantryItem,
} from '../lib/freezerLogic'
import type { FreezerItem, PantryItem, Ampel, FreezerTyp } from '../lib/state'

interface Props {
  freezerItems: FreezerItem[]
  pantryItems: PantryItem[]
  onFreezerChange: (items: FreezerItem[]) => void
  onPantryChange: (items: PantryItem[]) => void
}

type SubTab = 'gefriertruhe' | 'speisekammer'

const FREEZER_EMOJIS = ['🍲', '🥗', '🍕', '🍝', '🍗', '🐟', '🥩', '🥦']
const PANTRY_EMOJIS = ['🥫', '🛢️', '🧄', '🧅', '🧂', '🍝', '🧈', '🍞']

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  marginBottom: 8,
  outline: 'none',
}

export default function VorraeteScreen({ freezerItems, pantryItems, onFreezerChange, onPantryChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('gefriertruhe')
  const [adding, setAdding] = useState(false)

  const [fName, setFName] = useState('')
  const [fMenge, setFMenge] = useState('')
  const [fEmoji, setFEmoji] = useState('🍲')
  const [fTyp, setFTyp] = useState<FreezerTyp>('fertig')
  const [fAmpel, setFAmpel] = useState<Ampel>('green')

  const [pName, setPName] = useState('')
  const [pMenge, setPMenge] = useState('')
  const [pEmoji, setPEmoji] = useState('🥫')
  const [pAmpel, setPAmpel] = useState<Ampel>('green')

  function switchTab(t: SubTab) {
    setSubTab(t)
    setAdding(false)
  }

  async function saveFreezerItem() {
    if (!fName.trim()) return
    const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const item = await addFreezerItem({ typ: fTyp, emoji: fEmoji, name: fName.trim(), menge: fMenge, datum, ampel: fAmpel })
    if (item) {
      onFreezerChange([...freezerItems, item])
      setFName(''); setFMenge(''); setFEmoji('🍲'); setFTyp('fertig'); setFAmpel('green')
      setAdding(false)
    }
  }

  async function removeFreezerItem(id: string) {
    await deleteFreezerItem(id)
    onFreezerChange(freezerItems.filter(i => i.id !== id))
  }

  async function savePantryItem() {
    if (!pName.trim()) return
    const item = await addPantryItem({ emoji: pEmoji, name: pName.trim(), menge: pMenge, ampel: pAmpel })
    if (item) {
      onPantryChange([...pantryItems, item])
      setPName(''); setPMenge(''); setPEmoji('🥫'); setPAmpel('green')
      setAdding(false)
    }
  }

  async function removePantryItem(id: string) {
    await deletePantryItem(id)
    onPantryChange(pantryItems.filter(i => i.id !== id))
  }

  return (
    <div className="screen active">
      <div className="topbar"><h1>🗄️ Vorräte</h1></div>
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8 }}>
        <button className={`menu-tab${subTab === 'gefriertruhe' ? ' on' : ''}`} onClick={() => switchTab('gefriertruhe')}>
          ❄️ Gefriertruhe
        </button>
        <button className={`menu-tab${subTab === 'speisekammer' ? ' on' : ''}`} onClick={() => switchTab('speisekammer')}>
          🥫 Speisekammer
        </button>
      </div>
      <div className="content">

        {subTab === 'gefriertruhe' && (
          <>
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
              {freezerItems.length === 0 && (
                <div style={{ padding: '20px 12px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>
                  Gefriertruhe leer
                </div>
              )}
              {freezerItems.map(item => (
                <div key={item.id} className="storage-item">
                  <div className={`ampel ${item.ampel}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.emoji} {item.name}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{item.datum} · {item.menge}</div>
                  </div>
                  <button
                    onClick={() => removeFreezerItem(item.id)}
                    style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>

            {adding ? (
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button className={`menu-tab${fTyp === 'fertig' ? ' on' : ''}`} onClick={() => setFTyp('fertig')}>🍲 Fertig</button>
                  <button className={`menu-tab${fTyp === 'roh' ? ' on' : ''}`} onClick={() => setFTyp('roh')}>🥩 Roh</button>
                </div>
                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Name (z.B. Lasagne)" style={inputStyle} />
                <input value={fMenge} onChange={e => setFMenge(e.target.value)} placeholder="Menge (z.B. 2 Portionen)" style={inputStyle} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {FREEZER_EMOJIS.map(em => (
                    <span key={em} onClick={() => setFEmoji(em)} style={{ fontSize: 22, cursor: 'pointer', opacity: fEmoji === em ? 1 : 0.3 }}>{em}</span>
                  ))}
                </div>
                <AmpelPicker value={fAmpel} onChange={setFAmpel} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={saveFreezerItem}>Speichern</button>
                  <button className="btn" onClick={() => setAdding(false)} style={{ width: 'auto', padding: '13px 16px' }}>✕</button>
                </div>
              </div>
            ) : (
              <button className="btn soft" onClick={() => setAdding(true)}>+ Eintrag hinzufügen</button>
            )}
          </>
        )}

        {subTab === 'speisekammer' && (
          <>
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
              {pantryItems.length === 0 && (
                <div style={{ padding: '20px 12px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>
                  Speisekammer leer
                </div>
              )}
              {pantryItems.map(item => (
                <div key={item.id} className="storage-item">
                  <div className={`ampel ${item.ampel}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.emoji} {item.name}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{item.menge}</div>
                  </div>
                  <button
                    onClick={() => removePantryItem(item.id)}
                    style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>

            {adding ? (
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Name (z.B. Olivenöl)" style={inputStyle} />
                <input value={pMenge} onChange={e => setPMenge(e.target.value)} placeholder="Menge (z.B. 1 Flasche)" style={inputStyle} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {PANTRY_EMOJIS.map(em => (
                    <span key={em} onClick={() => setPEmoji(em)} style={{ fontSize: 22, cursor: 'pointer', opacity: pEmoji === em ? 1 : 0.3 }}>{em}</span>
                  ))}
                </div>
                <AmpelPicker value={pAmpel} onChange={setPAmpel} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={savePantryItem}>Speichern</button>
                  <button className="btn" onClick={() => setAdding(false)} style={{ width: 'auto', padding: '13px 16px' }}>✕</button>
                </div>
              </div>
            ) : (
              <button className="btn soft" onClick={() => setAdding(true)}>+ Eintrag hinzufügen</button>
            )}
          </>
        )}

      </div>
    </div>
  )
}

function AmpelPicker({ value, onChange }: { value: Ampel; onChange: (a: Ampel) => void }) {
  const labels: Record<Ampel, string> = { green: 'Frisch', yellow: 'Bald', red: 'Dringend' }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: '#888' }}>Status:</span>
      {(['green', 'yellow', 'red'] as Ampel[]).map(a => (
        <div
          key={a}
          onClick={() => onChange(a)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            opacity: value === a ? 1 : 0.35,
          }}
        >
          <div className={`ampel ${a}`} />
          <span style={{ fontSize: 11, color: '#555' }}>{labels[a]}</span>
        </div>
      ))}
    </div>
  )
}
