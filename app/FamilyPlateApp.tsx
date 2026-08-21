'use client'
import { useState, useEffect } from 'react'
import { loadWeekPlan, saveWeekPlan } from '../lib/mealLogic'
import { loadFreezerItems, loadPantryItems } from '../lib/freezerLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab } from '../lib/state'
import WocheScreen from './WocheScreen'
import VorraeteScreen from './VorraeteScreen'
import EinkaufScreen from './EinkaufScreen'
import ProfilScreen from './ProfilScreen'

export default function FamilyPlateApp() {
  const [weekPlan, setWeekPlan] = useState<WeekPlanEntry[]>([])
  const [mealsData, setMealsData] = useState<Record<string, Rezept>>({})
  const [planMittag, setPlanMittag] = useState(true)
  const [planWE, setPlanWE] = useState(false)
  const [freezerItems, setFreezerItems] = useState<FreezerItem[]>([])
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('woche')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadWeekPlan(), loadFreezerItems(), loadPantryItems()]).then(
      ([{ plan, mealsData: md }, freezer, pantry]) => {
        setWeekPlan(plan)
        setMealsData(md)
        setFreezerItems(freezer)
        setPantryItems(pantry)
        setLoading(false)
      },
    )
  }, [])

  async function handleWeekPlanChange(plan: WeekPlanEntry[], meals: Record<string, Rezept>) {
    setWeekPlan(plan)
    setMealsData(meals)
    await saveWeekPlan(plan, meals)
  }

  if (loading) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🐀</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Lade FamilyPlate…</div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="statusbar">
        <span>9:41</span>
        <span>🍽 FamilyPlate</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'woche' && (
          <WocheScreen
            weekPlan={weekPlan}
            mealsData={mealsData}
            planMittag={planMittag}
            planWE={planWE}
            freezerItems={freezerItems}
            pantryItems={pantryItems}
            onWeekPlanChange={handleWeekPlanChange}
          />
        )}
        {activeTab === 'gefriertruhe' && (
          <VorraeteScreen
            freezerItems={freezerItems}
            pantryItems={pantryItems}
            onFreezerChange={setFreezerItems}
            onPantryChange={setPantryItems}
          />
        )}
        {activeTab === 'einkauf' && (
          <EinkaufScreen
            weekPlan={weekPlan}
            mealsData={mealsData}
            shoppingList={shoppingList}
            onShoppingListChange={setShoppingList}
          />
        )}
        {activeTab === 'rezepte' && (
          <ProfilScreen
            planMittag={planMittag}
            planWE={planWE}
            onPlanMittagChange={setPlanMittag}
            onPlanWEChange={setPlanWE}
          />
        )}
      </div>
      <nav className="nav">
        <button className={`nav-tab${activeTab === 'woche' ? ' active' : ''}`} onClick={() => setActiveTab('woche')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span>Woche</span>
        </button>
        <button className={`nav-tab${activeTab === 'gefriertruhe' ? ' active' : ''}`} onClick={() => setActiveTab('gefriertruhe')}>
          <svg viewBox="0 0 24 24"><path d="M20 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>
          <span>Vorräte</span>
        </button>
        <button className={`nav-tab${activeTab === 'einkauf' ? ' active' : ''}`} onClick={() => setActiveTab('einkauf')}>
          <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
          <span>Einkauf</span>
        </button>
        <button className={`nav-tab${activeTab === 'rezepte' ? ' active' : ''}`} onClick={() => setActiveTab('rezepte')}>
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          <span>Profil</span>
        </button>
      </nav>
    </div>
  )
}
