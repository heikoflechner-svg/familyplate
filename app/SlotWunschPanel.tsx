'use client'
import type { Wish, WochenSlot, Chef } from '../lib/state'

const CFG: Record<string, { bg: string; c: string }> = {
  MA: { bg: '#E1F5EE', c: '#0F6E56' },
  PA: { bg: '#E6F1FB', c: '#0C447C' },
  TI: { bg: '#FBEAF0', c: '#72243E' },
}

interface Props {
  tag: string
  slot: WochenSlot
  wishes: Wish[]
  personNames: Record<Chef, string>
  originalEntry?: { emoji: string; gericht: string }
  isWochenchef?: boolean
  planConfirmed?: boolean
  selectedAltId?: string
  checkedErgIds?: string[]
  onSelectAlt?: (id: string | 'original') => void
  onToggleErg?: (id: string) => void
}

export default function SlotWunschPanel({
  tag, slot, wishes, personNames,
  originalEntry, isWochenchef, planConfirmed,
  selectedAltId = 'original', checkedErgIds, onSelectAlt, onToggleErg,
}: Props) {
  const slotWishes = wishes.filter(w => w.tag === tag && w.slot === slot)
  if (slotWishes.length === 0) return null

  const alternativen = slotWishes.filter(w => w.type === 'alternative')
  const ergaenzungen = slotWishes.filter(w => w.type === 'ergaenzung')
  const showDecision = isWochenchef && !planConfirmed && !!onSelectAlt

  return (
    <div style={{ padding: '6px 12px 8px', background: '#f7f9fc', borderTop: '1px solid #eef2f7' }}>

      {alternativen.length > 0 && (
        <div style={{ marginBottom: ergaenzungen.length > 0 ? 8 : 0 }}>
          <div style={{ fontSize: 10, color: '#9ab', fontWeight: 700, marginBottom: 5, letterSpacing: '.3px', textTransform: 'uppercase' }}>
            🔄 Alternativen
          </div>

          {showDecision && originalEntry && (
            <button
              onClick={() => onSelectAlt?.('original')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 7, marginBottom: 3, cursor: 'pointer',
                border: `1px solid ${selectedAltId === 'original' ? '#1D9E75' : '#ddd'}`,
                background: selectedAltId === 'original' ? '#E1F5EE' : 'white',
              }}
            >
              <span style={{ fontSize: 12, color: selectedAltId === 'original' ? '#1D9E75' : '#ccc' }}>
                {selectedAltId === 'original' ? '◉' : '○'}
              </span>
              <span style={{ fontSize: 14 }}>{originalEntry.emoji}</span>
              <span style={{ fontSize: 12, flex: 1, color: '#222', fontWeight: 500 }}>{originalEntry.gericht}</span>
              <span style={{ fontSize: 10, color: '#bbb' }}>Rémy</span>
            </button>
          )}

          {alternativen.map(w => {
            const c = CFG[w.person] ?? CFG.MA
            const selected = selectedAltId === w.id
            return showDecision ? (
              <button
                key={w.id}
                onClick={() => onSelectAlt?.(w.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '5px 8px', borderRadius: 7, marginBottom: 3, cursor: 'pointer',
                  border: `1px solid ${selected ? '#1D9E75' : '#ddd'}`,
                  background: selected ? '#E1F5EE' : 'white',
                }}
              >
                <span style={{ fontSize: 12, color: selected ? '#1D9E75' : '#ccc' }}>
                  {selected ? '◉' : '○'}
                </span>
                <span style={{ fontSize: 14 }}>{w.emoji}</span>
                <span style={{ fontSize: 12, flex: 1, color: '#222', fontWeight: 500 }}>{w.dishName}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>
                  {personNames[w.person]}
                </span>
              </button>
            ) : (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 15 }}>{w.emoji}</span>
                <span style={{ fontSize: 12, flex: 1, color: '#222', fontWeight: 500 }}>{w.dishName}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>
                  {personNames[w.person]}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {ergaenzungen.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#9ab', fontWeight: 700, marginBottom: 5, letterSpacing: '.3px', textTransform: 'uppercase' }}>
            ➕ Ergänzungen
          </div>
          {ergaenzungen.map(w => {
            const c = CFG[w.person] ?? CFG.MA
            const checked = checkedErgIds?.includes(w.id) ?? false
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {showDecision && (
                  <button
                    onClick={() => onToggleErg?.(w.id)}
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                      border: `1px solid ${checked ? '#1D9E75' : '#ddd'}`,
                      background: checked ? '#1D9E75' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </button>
                )}
                <span style={{ fontSize: 12, flex: 1, color: '#555', fontStyle: 'italic' }}>„{w.text}"</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>
                  {personNames[w.person]}
                </span>
                {showDecision && checked && (
                  <span style={{ fontSize: 10, color: '#1D9E75', fontWeight: 600, whiteSpace: 'nowrap' }}>→ Einkauf</span>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
