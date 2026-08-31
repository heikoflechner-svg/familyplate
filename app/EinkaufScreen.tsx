'use client'
import { useState } from 'react'
import {
  generateShoppingList,
  groupShoppingByMeal,
  consolidateShoppingList,
  toggleConsolidatedItem,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCompleted,
} from '../lib/shoppingLogic'
import type { ConsolidatedItem } from '../lib/shoppingLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem, Chef } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

interface Props {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => void
  currentUser: Chef | null
  wochenchef: Chef
  shopDone: boolean
  onShopDoneChange: (done: boolean) => void
}

type ViewMode = 'tag' | 'zusammen'

export default function EinkaufScreen({ weekPlan, mealsData, shoppingList, onShoppingListChange, currentUser, wochenchef, shopDone, onShopDoneChange }: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['alle']))
  const [viewMode, setViewMode] = useState<ViewMode>('tag')

  const plannedDays = WOCHENTAGE.filter(t => weekPlan.some(e => e.tag === t))

  function toggleDay(day: string) {
    const s = new Set(selectedDays)
    if (day === 'alle') {
      setSelectedDays(s.has('alle') ? new Set<string>() : new Set(['alle']))
      return
    }
    s.delete('alle')
    s.has(day) ? s.delete(day) : s.add(day)
    if (s.size === 0) s.add('alle')
    setSelectedDays(s)
  }

  function openDayPicker() {
    setSelectedDays(new Set(['alle']))
    setDayPickerOpen(true)
  }

  function confirmGenerate() {
    const days = selectedDays.has('alle') ? undefined : [...selectedDays]
    onShoppingListChange(generateShoppingList(weekPlan, mealsData, days))
    setDayPickerOpen(false)
  }

  function toggle(id: string) { onShoppingListChange(toggleShoppingItem(shoppingList, id)) }
  function remove(id: string) { onShoppingListChange(removeShoppingItem(shoppingList, id)) }
  function toggleConsolidated(ids: string[]) { onShoppingListChange(toggleConsolidatedItem(shoppingList, ids)) }

  function addManual() {
    if (!newName.trim()) return
    onShoppingListChange(addShoppingItem(shoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  const recipeItems = shoppingList.filter(i => i.gericht)
  const manualItems = shoppingList.filter(i => !i.gericht)
  const groups = groupShoppingByMeal(recipeItems, weekPlan)
  const consolidated = consolidateShoppingList(recipeItems)
  const doneCount = shoppingList.filter(i => i.erledigt).length
  const dayCount = new Set(recipeItems.map(i => i.tag)).size
  const gerichtCount = new Set(recipeItems.map(i => i.gericht)).size

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>🛒 Einkauf</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {shoppingList.length > 0 && (
            <button
              onClick={openDayPicker}
              style={{ border: 'none', background: 'none', color: '#1D9E75', fontSize: 12, cursor: 'pointer' }}
            >
              🔄 Neu
            </button>
          )}
          {doneCount > 0 && (
            <button
              onClick={() => onShoppingListChange(clearCompleted(shoppingList))}
              style={{ border: 'none', background: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer' }}
            >
              Erledigtes löschen
            </button>
          )}
        </div>
      </div>
      <div className="content">

        {dayPickerOpen && (
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #eee' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 }}>
              Für welche Tage einkaufen?
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                className={`menu-tab${selectedDays.has('alle') ? ' on' : ''}`}
                onClick={() => toggleDay('alle')}
              >
                Alle
              </button>
              {plannedDays.map(t => (
                <button
                  key={t}
                  className={`menu-tab${selectedDays.has('alle') || selectedDays.has(t) ? ' on' : ''}`}
                  onClick={() => toggleDay(t)}
                >
                  {t.slice(0, 2)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                onClick={confirmGenerate}
                style={{ flex: 1, padding: '10px' }}
              >
                📋 Liste erstellen
              </button>
              <button
                onClick={() => setDayPickerOpen(false)}
                style={{ padding: '10px 16px', border: '1px solid #ddd', borderRadius: 10, background: 'white', cursor: 'pointer', color: '#888', fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {shoppingList.length === 0 && !dayPickerOpen && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>
              {weekPlan.length === 0
                ? 'Zuerst den Wochenplan erstellen.'
                : 'Einkaufsliste aus dem Wochenplan generieren?'}
            </div>
            {weekPlan.length > 0 && (
              <button
                className="btn primary"
                style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }}
                onClick={openDayPicker}
              >
                📋 Liste generieren
              </button>
            )}
          </div>
        )}

        {shoppingList.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              {recipeItems.length > 0 && (
                <span style={{ fontSize: 11, color: '#aaa', flex: 1 }}>
                  {dayCount} {dayCount === 1 ? 'Tag' : 'Tage'} · {gerichtCount} {gerichtCount === 1 ? 'Gericht' : 'Gerichte'} · {doneCount}/{shoppingList.length} erledigt
                </span>
              )}
              {recipeItems.length > 0 && (
                <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {([['tag', 'Nach Tag'], ['zusammen', 'Zusammengefasst']] as [ViewMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
                        background: viewMode === mode ? '#1D9E75' : 'white',
                        color: viewMode === mode ? 'white' : '#888',
                        fontWeight: viewMode === mode ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {viewMode === 'tag' && (
              <>
                {groups.map(group => (
                  <div key={`${group.tag}-${group.slot}-${group.gericht}`} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingBottom: 4, borderBottom: '1.5px solid #eee' }}>
                      <span style={{ fontSize: 11 }}>{group.slot === 'Mittag' ? '🌞' : '🌙'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        {group.tag.slice(0, 2)} · {group.slot}
                      </span>
                      <span style={{ fontSize: 13, marginLeft: 4 }}>{group.emoji}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{group.gericht}</span>
                    </div>
                    {group.items.map(item => (
                      <ItemRow key={item.id} item={item} onToggle={() => toggle(item.id)} onRemove={() => remove(item.id)} />
                    ))}
                  </div>
                ))}
              </>
            )}

            {viewMode === 'zusammen' && (
              <>
                {consolidated.map(item => (
                  <ConsolidatedRow key={item.name} item={item} onToggle={() => toggleConsolidated(item.ids)} />
                ))}
              </>
            )}

            {manualItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="lbl">Weitere Artikel</div>
                {manualItems.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={() => toggle(item.id)} onRemove={() => remove(item.id)} />
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <div className="lbl">Manuell hinzufügen</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="Artikel"
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
            />
            <input
              value={newMenge}
              onChange={e => setNewMenge(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="Menge"
              style={{ width: 76, border: '1px solid #ddd', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={addManual}
              style={{ border: 'none', background: '#1D9E75', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >+</button>
          </div>
        </div>

        {currentUser === wochenchef && !shopDone && shoppingList.length > 0 && (
          <div style={{ marginTop: 24, borderTop: '2px solid #f0f0f0', paddingTop: 20 }}>
            <button
              onClick={() => onShopDoneChange(true)}
              style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: 14,
                background: '#1D9E75', color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ✓ Einkauf erledigt
            </button>
          </div>
        )}

        {shopDone && (
          <div style={{ marginTop: 24, textAlign: 'center', color: '#1D9E75', fontSize: 13, fontWeight: 600, padding: '12px 0' }}>
            ✓ Einkauf abgeschlossen
          </div>
        )}

      </div>
    </div>
  )
}

function ItemRow({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void }) {
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isErsatz ? '#2563EB' : '#111'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <Checkbox checked={item.erledigt} onToggle={onToggle} />
      <div style={{ flex: 1, textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
        {item.name}
        {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
      </div>
      <button
        onClick={onRemove}
        style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
      >×</button>
    </div>
  )
}

function ConsolidatedRow({ item, onToggle }: { item: ConsolidatedItem; onToggle: () => void }) {
  const isErsatz = item.kategorie === 'Ersatz-Zutat'
  const textColor = item.erledigt ? '#bbb' : isErsatz ? '#2563EB' : '#111'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0 9px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <Checkbox checked={item.erledigt} onToggle={onToggle} />
      <div style={{ flex: 1 }}>
        <div style={{ textDecoration: item.erledigt ? 'line-through' : 'none', color: textColor, fontSize: 13 }}>
          {item.name}
          {item.menge && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 5 }}>({item.menge})</span>}
        </div>
        {item.sources.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
            {item.sources.map((s, i) => (
              <span key={i} style={{ fontSize: 10, color: '#bbb' }}>
                {s.tag.slice(0, 2)} {s.slot === 'Mittag' ? '🌞' : '🌙'} {s.gericht}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
        border: `1.5px solid ${checked ? '#1D9E75' : '#ccc'}`,
        background: checked ? '#1D9E75' : '#fff',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 12,
      }}
    >
      {checked ? '✓' : ''}
    </div>
  )
}
