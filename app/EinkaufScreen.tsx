'use client'
import { useState } from 'react'
import {
  generateShoppingList,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCompleted,
  groupByKategorie,
} from '../lib/shoppingLogic'
import type { WeekPlanEntry, Rezept, ShoppingItem } from '../lib/state'

interface Props {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  shoppingList: ShoppingItem[]
  onShoppingListChange: (list: ShoppingItem[]) => void
}

export default function EinkaufScreen({ weekPlan, mealsData, shoppingList, onShoppingListChange }: Props) {
  const [newName, setNewName] = useState('')
  const [newMenge, setNewMenge] = useState('')

  function generate() {
    onShoppingListChange(generateShoppingList(weekPlan, mealsData))
  }

  function toggle(id: string) {
    onShoppingListChange(toggleShoppingItem(shoppingList, id))
  }

  function remove(id: string) {
    onShoppingListChange(removeShoppingItem(shoppingList, id))
  }

  function addManual() {
    if (!newName.trim()) return
    onShoppingListChange(addShoppingItem(shoppingList, newName.trim(), newMenge.trim()))
    setNewName('')
    setNewMenge('')
  }

  const grouped = groupByKategorie(shoppingList)
  const doneCount = shoppingList.filter(i => i.erledigt).length
  const plannedMealCount = new Set(weekPlan.map(e => e.gericht)).size
  const kategorienCount = Object.keys(grouped).length
  const summaryText = shoppingList.length > 0
    ? `${plannedMealCount} Gerichte · ${shoppingList.length} Zutaten · ${kategorienCount} ${kategorienCount === 1 ? 'Kategorie' : 'Kategorien'}`
    : null

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>🛒 Einkauf</h1>
        {doneCount > 0 && (
          <button
            onClick={() => onShoppingListChange(clearCompleted(shoppingList))}
            style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#1D9E75', fontSize: 12, cursor: 'pointer' }}
          >
            Erledigtes löschen
          </button>
        )}
      </div>
      <div className="content">

        {shoppingList.length === 0 ? (
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
                onClick={generate}
              >
                📋 Liste generieren
              </button>
            )}
          </div>
        ) : (
          <>
            {summaryText && (
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{summaryText}</div>
            )}
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>
              {doneCount}/{shoppingList.length} erledigt
            </div>
            {Object.entries(grouped).map(([kat, items]) => (
              <div key={kat} style={{ marginBottom: 16 }}>
                <div className="lbl">{kat}</div>
                {items.map(item => (
                  <div
                    key={item.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f5f5f5' }}
                  >
                    <div
                      onClick={() => toggle(item.id)}
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
                      onClick={() => remove(item.id)}
                      style={{ border: 'none', background: 'none', color: '#ddd', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
            ))}
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
