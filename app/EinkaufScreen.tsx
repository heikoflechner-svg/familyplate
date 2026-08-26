'use client'
import { useState } from 'react'
import {
  generateShoppingList,
  groupShoppingByMeal,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCompleted,
} from '../lib/shoppingLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem } from '../lib/state'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

interface Props {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => void
}

export default function EinkaufScreen({ weekPlan, mealsData, shoppingList, onShoppingListChange }: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['alle']))

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

  function addManual() {
    if (!newName.trim()) return
    onShoppingListChange(addShoppingItem(shoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  const recipeItems = shoppingList.filter(i => i.gericht)
  const manualItems = shoppingList.filter(i => !i.gericht)
  const groups = groupShoppingByMeal(recipeItems, weekPlan)
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
            {recipeItems.length > 0 && (
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 14 }}>
                {dayCount} {dayCount === 1 ? 'Tag' : 'Tage'} · {gerichtCount} {gerichtCount === 1 ? 'Gericht' : 'Gerichte'} · {shoppingList.length} Artikel · {doneCount}/{shoppingList.length} erledigt
              </div>
            )}

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

      </div>
    </div>
  )
}

function ItemRow({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderBottom: '1px solid #f5f5f5' }}>
      <div
        onClick={onToggle}
        style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${item.erledigt ? '#1D9E75' : '#ccc'}`,
          background: item.erledigt ? '#1D9E75' : '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12,
        }}
      >
        {item.erledigt ? '✓' : ''}
      </div>
      <div style={{ flex: 1, textDecoration: item.erledigt ? 'line-through' : 'none', color: item.erledigt ? '#bbb' : '#111', fontSize: 13 }}>
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
