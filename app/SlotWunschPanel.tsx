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
}

export default function SlotWunschPanel({ tag, slot, wishes, personNames }: Props) {
  const slotWishes = wishes.filter(w => w.tag === tag && w.slot === slot)
  if (slotWishes.length === 0) return null

  const alternativen = slotWishes.filter(w => w.type === 'alternative')
  const ergaenzungen = slotWishes.filter(w => w.type === 'ergaenzung')

  return (
    <div style={{ padding: '5px 12px 7px', background: '#f7f9fc', borderTop: '1px solid #eef2f7' }}>
      {alternativen.length > 0 && (
        <div style={{ marginBottom: ergaenzungen.length > 0 ? 6 : 0 }}>
          <div style={{ fontSize: 10, color: '#9ab', fontWeight: 700, marginBottom: 4, letterSpacing: '.3px', textTransform: 'uppercase' }}>
            🔄 Alternativen
          </div>
          {alternativen.map(w => {
            const c = CFG[w.person] ?? CFG.MA
            return (
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
          <div style={{ fontSize: 10, color: '#9ab', fontWeight: 700, marginBottom: 4, letterSpacing: '.3px', textTransform: 'uppercase' }}>
            ➕ Ergänzungen
          </div>
          {ergaenzungen.map(w => {
            const c = CFG[w.person] ?? CFG.MA
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 12, flex: 1, color: '#555', fontStyle: 'italic' }}>„{w.text}"</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.c, padding: '1px 7px', borderRadius: 6 }}>
                  {personNames[w.person]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
