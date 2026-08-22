'use client'
import { useState, useEffect } from 'react'
import { loadWeekPlan, saveWeekPlan, saveAttendance } from '../lib/mealLogic'
import { loadFreezerItems, loadPantryItems } from '../lib/freezerLogic'
import { loadFamilyProfile, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { signOut, onAuthChange } from '../lib/auth'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab, Wish, Chef, FamilyProfile, DayAttendance } from '../lib/state'
import LoginScreen from './LoginScreen'
import WocheScreen from './WocheScreen'
import VorraeteScreen from './VorraeteScreen'
import EinkaufScreen from './EinkaufScreen'
import ProfilScreen from './ProfilScreen'
import OnboardingWizard from './OnboardingWizard'

export default function FamilyPlateApp() {
  const [currentUser, setCurrentUser] = useState<Chef | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)

  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [attendance, setAttendance] = useState<DayAttendance[]>([])
  const [weekPlan, setWeekPlan] = useState<WeekPlanEntry[]>([])
  const [mealsData, setMealsData] = useState<Record<string, Rezept>>({})
  const [planMittag, setPlanMittag] = useState(true)
  const [planWE, setPlanWE] = useState(false)
  const [freezerItems, setFreezerItems] = useState<FreezerItem[]>([])
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [wishes, setWishes] = useState<Wish[]>([])
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('woche')

  useEffect(() => {
    return onAuthChange(chef => {
      setCurrentUser(chef)
      setAuthChecked(true)
      if (chef) {
        setDataLoading(true)
      } else {
        setDataLoading(false)
        setWeekPlan([])
        setMealsData({})
        setWishes([])
        setFreezerItems([])
        setPantryItems([])
        setShoppingList([])
        setFamilyProfile(null)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUser) return
    Promise.all([loadWeekPlan(), loadFreezerItems(), loadPantryItems(), loadFamilyProfile()]).then(
      ([{ plan, mealsData: md, wishes: w, attendance: att }, freezer, pantry, profile]) => {
        setWeekPlan(plan)
        setMealsData(md)
        setWishes(w)
        setAttendance(att)
        setFreezerItems(freezer)
        setPantryItems(pantry)
        setFamilyProfile(profile)
        setDataLoading(false)
      },
    )
  }, [currentUser])

  async function handleWeekPlanChange(plan: WeekPlanEntry[], meals: Record<string, Rezept>) {
    setWeekPlan(plan)
    setMealsData(meals)
    await saveWeekPlan(plan, meals, wishes)
  }

  async function handleWishesChange(newWishes: Wish[]) {
    setWishes(newWishes)
    await saveWeekPlan(weekPlan, mealsData, newWishes)
  }

  async function handleAttendanceChange(newAttendance: DayAttendance[]) {
    setAttendance(newAttendance)
    await saveAttendance(newAttendance)
  }

  if (!authChecked || dataLoading) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🐀</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Lade FamilyPlate…</div>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginScreen />
  }

  if (!familyProfile) {
    return <OnboardingWizard key="onboarding" onDone={profile => setFamilyProfile(profile)} />
  }

  if (editingProfile) {
    return (
      <OnboardingWizard
        key="edit"
        initialProfile={familyProfile}
        onDone={profile => { setFamilyProfile(profile); setEditingProfile(false) }}
        onCancel={() => setEditingProfile(false)}
      />
    )
  }

  const members = familyProfile.members
  const currentName = members.find(m => m.id === currentUser)?.name ?? currentUser

  return (
    <div className="phone">
      <div className="statusbar">
        <span>9:41</span>
        <span>🍽 FamilyPlate</span>
        <span style={{ fontSize: 10, color: '#aaa' }}>{currentName}</span>
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
            wishes={wishes}
            wochenchef={currentUser}
            members={members}
            attendance={attendance}
            onWeekPlanChange={handleWeekPlanChange}
            onWishesChange={handleWishesChange}
            onAttendanceChange={handleAttendanceChange}
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
            currentUser={currentUser}
            familyProfile={familyProfile}
            onPlanMittagChange={setPlanMittag}
            onPlanWEChange={setPlanWE}
            onSignOut={signOut}
            onEditProfile={() => setEditingProfile(true)}
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
