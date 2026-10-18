'use client'
import { useState, useEffect } from 'react'
import type { Rezept } from '../lib/state'

export interface RecipeModalProps {
  name: string
  rezept: Rezept | null
  loading?: boolean
  onClose: () => void
  canRewrite?: boolean
  onRewrite?: () => void
  onAdjust?: (wunsch: string) => void
  allergieHinweise?: string[]
  offeneAllergene?: string[]
  onSaveToBook?: (rezept: Rezept) => void
  savedToBook?: boolean
  saveToBookLoading?: boolean
  isFavorit?: boolean
  onToggleFavorit?: () => void
  onDelete?: () => void
  onUebernehmen?: () => void
  onEdit?: () => void
}

export default function RecipeModal({
  name, rezept, loading, onClose, canRewrite, onRewrite, onAdjust,
  allergieHinweise, offeneAllergene,
  onSaveToBook, savedToBook, saveToBookLoading,
  isFavorit, onToggleFavorit, onDelete,
  onUebernehmen, onEdit,
}: RecipeModalProps) {
  const [confirmRewrite, setConfirmRewrite] = useState(false)
  const [adjustMode, setAdjustMode] = useState(false)
  const [adjustText, setAdjustText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    if (loading) { setConfirmRewrite(false); setAdjustMode(false); setAdjustText('') }
  }, [loading])
  const hatRezept = !!rezept && rezept.schritte.length > 0
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'white', display: 'flex', flexDirection: 'column' }}>
      <div className="topbar">
        <button className="back" onClick={onClose}>‹</button>
        <h1 style={{ fontSize: 15 }}>{rezept?.emoji ?? '🍽'} {name}</h1>
        {onEdit && (
          <button onClick={onEdit}
            style={{ marginLeft: 'auto', marginRight: 2, background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '4px 8px', color: '#666' }}>
            ✏️
          </button>
        )}
        {onToggleFavorit && (
          <button onClick={onToggleFavorit}
            style={{ marginLeft: onEdit ? 0 : 'auto', marginRight: 4, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>
            {isFavorit ? '⭐' : '☆'}
          </button>
        )}
      </div>
      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 13 }}>
            🐀 Rémy schreibt das Rezept…
          </div>
        ) : !hatRezept ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13 }}>
            Kein Rezept verfügbar – bitte erneut antippen.
          </div>
        ) : rezept && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 6, padding: '3px 8px', color: '#666' }}>{rezept.schwierigkeit}</span>
              <span style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 6, padding: '3px 8px', color: '#666' }}>
                ⏱ {rezept.zeitGeschaetzt ? 'ca. ' : ''}{rezept.minuten} min{rezept.arbeitszeitMinuten && rezept.arbeitszeitMinuten !== rezept.minuten ? ` (davon ${rezept.arbeitszeitMinuten} min Arbeit)` : ''}
              </span>
              {rezept.personenAnzahl && <span style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 6, padding: '3px 8px', color: '#666' }}>👥 {rezept.personenAnzahl} Person{rezept.personenAnzahl === 1 ? '' : 'en'}</span>}
            </div>

            <div className="lbl">Zutaten</div>
            <div style={{ marginBottom: 20 }}>
              {rezept.zutaten.map((z, i) => {
                const isGrundvorrat = z.typ === 'grundvorrat'
                const isAllergie = !!z.fuer
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5', opacity: isGrundvorrat ? 0.55 : 1, ...(isAllergie ? { background: '#FFFBEB', borderRadius: 6, padding: '5px 6px', margin: '2px 0' } : {}) }}>
                    {isAllergie && <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>}
                    <span style={{ fontSize: 12, color: '#aaa', minWidth: 70, flexShrink: 0 }}>{z.menge}</span>
                    <span style={{ fontSize: 13, color: isGrundvorrat ? '#888' : '#111', fontStyle: isGrundvorrat ? 'italic' : 'normal', flex: 1 }}>
                      {z.name}{isGrundvorrat ? ' (im Haushalt vorhanden)' : ''}
                      {isAllergie && <span style={{ color: '#92400E', fontSize: 11 }}>{' · für '}{z.fuer}</span>}
                    </span>
                  </div>
                )
              })}
              {!rezept.zutaten.some(z => z.fuer) && (rezept.ersetzteZutaten?.length ?? 0) > 0 && (
                rezept.ersetzteZutaten!.map((s, i) => (
                  <div key={`er-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 6px', borderRadius: 6, background: '#FFFBEB', margin: '2px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>
                    <span style={{ fontSize: 13, color: '#92400E', flex: 1 }}>{s}</span>
                  </div>
                ))
              )}
            </div>

            <div className="lbl">Zubereitung</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rezept.schritte.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>

            {(allergieHinweise?.length ?? 0) > 0 && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                {allergieHinweise!.map((h, i) => <div key={i} style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>⚠️ {h}</div>)}
              </div>
            )}

            {(offeneAllergene?.length ?? 0) > 0 && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>⚠️ Allergie nicht abgedeckt</div>
                {offeneAllergene!.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.5 }}>{w}</div>)}
              </div>
            )}

            <div style={{ marginTop: 12, padding: '8px 10px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>ℹ️ Bitte Packungsangaben selbst prüfen.</span>
            </div>

            {rezept.quelle && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Quelle: </span>
                {rezept.quelleUrl ? (
                  <a href={rezept.quelleUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#1D9E75', textDecoration: 'underline' }}>{rezept.quelle}</a>
                ) : (
                  <span style={{ fontSize: 11, color: '#6B7280' }}>{rezept.quelle}</span>
                )}
              </div>
            )}

            {rezept.notizen && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>Notizen</div>
                <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rezept.notizen}</div>
              </div>
            )}

            {onSaveToBook && !savedToBook && (
              <button
                onClick={() => onSaveToBook(rezept)}
                disabled={saveToBookLoading}
                style={{ marginTop: 16, width: '100%', padding: '10px 0', background: '#FFF9E6', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13, color: '#92400E', fontWeight: 600, cursor: saveToBookLoading ? 'default' : 'pointer', opacity: saveToBookLoading ? 0.6 : 1 }}
              >
                {saveToBookLoading ? '⏳ Wird gespeichert…' : '⭐ Ins Rezeptbuch'}
              </button>
            )}
            {savedToBook && (
              <div style={{ marginTop: 16, padding: '10px 0', textAlign: 'center', fontSize: 13, color: '#0F6E56', fontWeight: 600 }}>
                ✓ Im Rezeptbuch gespeichert
              </div>
            )}

            {canRewrite && !confirmRewrite && !adjustMode && (
              <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmRewrite(true)} style={{ flex: 1, padding: '10px 0', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#666', cursor: 'pointer' }}>↻ Rezept neu schreiben</button>
                <button onClick={() => setAdjustMode(true)} style={{ flex: 1, padding: '10px 0', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#666', cursor: 'pointer' }}>✏️ Rezept anpassen</button>
              </div>
            )}
            {canRewrite && confirmRewrite && (
              <div style={{ marginTop: 20, padding: '12px 14px', background: '#FFFBEB', borderRadius: 10, border: '1px solid #FDE68A' }}>
                <div style={{ fontSize: 13, color: '#92400E', marginBottom: 10 }}>Rezept neu schreiben? Das bisherige Rezept wird ersetzt.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setConfirmRewrite(false); onRewrite?.() }} style={{ flex: 1, padding: '8px 0', background: '#F59E0B', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ja, neu schreiben</button>
                  <button onClick={() => setConfirmRewrite(false)} style={{ flex: 1, padding: '8px 0', background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
                </div>
              </div>
            )}
            {canRewrite && adjustMode && (
              <div style={{ marginTop: 20 }}>
                <textarea
                  placeholder="Was soll anders sein? (z.B. ohne Sellerie, mehr Knoblauch, zusätzlich Parmesan)"
                  maxLength={200}
                  value={adjustText}
                  onChange={e => setAdjustText(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, resize: 'none', height: 80, boxSizing: 'border-box', color: '#111', lineHeight: 1.5 }}
                />
                <div style={{ fontSize: 11, color: '#aaa', textAlign: 'right', marginTop: 2 }}>{adjustText.length}/200</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => { setAdjustMode(false); setAdjustText('') }} style={{ flex: 1, padding: '8px 0', background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
                  <button
                    onClick={() => { if (adjustText.trim()) { onAdjust?.(adjustText.trim()); setAdjustMode(false); setAdjustText('') } }}
                    disabled={!adjustText.trim()}
                    style={{ flex: 1, padding: '8px 0', background: adjustText.trim() ? '#1D9E75' : '#d1fae5', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: adjustText.trim() ? 'pointer' : 'default' }}
                  >Anpassen</button>
                </div>
              </div>
            )}

            {onDelete && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                style={{ marginTop: 16, width: '100%', padding: '10px 0', background: 'none', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626', cursor: 'pointer' }}>
                🗑️ Aus Rezeptbuch löschen
              </button>
            )}
            {onDelete && confirmDelete && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
                <div style={{ fontSize: 13, color: '#991B1B', marginBottom: 10 }}>Rezept wirklich löschen?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setConfirmDelete(false); onDelete() }} style={{ flex: 1, padding: '8px 0', background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Löschen</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '8px 0', background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {onUebernehmen && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: 'white', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>✕ Abbrechen</button>
          <button onClick={onUebernehmen} style={{ flex: 2, padding: '11px 0', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✓ Übernehmen</button>
        </div>
      )}
    </div>
  )
}
