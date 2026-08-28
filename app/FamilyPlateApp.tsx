'use client'
import { useState, useEffect, useRef } from 'react'
import { loadWeekPlan, saveWeekPlan, saveAttendance, saveShoppingList, saveProposals, saveWochenchef, savePlanConfirmed } from '../lib/mealLogic'
import { loadFreezerItems, loadPantryItems } from '../lib/freezerLogic'
import { loadFamilyProfile, saveFamilyProfile, applyChefStats, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { signOut, onAuthChange } from '../lib/auth'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab, Wish, Chef, FamilyProfile, DayAttendance, ChangeProposal } from '../lib/state'
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
  const lastAuthUser = useRef<Chef | null>(null)

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
  const [proposals, setProposals] = useState<ChangeProposal[]>([])
  const [activeWochenchef, setActiveWochenchef] = useState<Chef>('PA')
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('woche')

  useEffect(() => {
    return onAuthChange(chef => {
      const prev = lastAuthUser.current
      lastAuthUser.current = chef
      setCurrentUser(chef)
      setAuthChecked(true)
      if (chef) {
        // Only start the loading spinner when the user actually changes (avoids
        // re-firing on TOKEN_REFRESHED / SIGNED_IN after data is already loaded)
        if (prev !== chef) setDataLoading(true)
      } else {
        setDataLoading(false)
        setWeekPlan([])
        setMealsData({})
        setWishes([])
        setFreezerItems([])
        setPantryItems([])
        setShoppingList([])
        setFamilyProfile(null)
        setProposals([])
        setActiveWochenchef('PA')
        setPlanConfirmed(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUser) return
    Promise.all([loadWeekPlan(), loadFreezerItems(), loadPantryItems(), loadFamilyProfile()])
      .then(([{ plan, mealsData: md, wishes: w, attendance: att, shoppingList: sl, proposals: pr, wochenchef: wc, planConfirmed: pc }, freezer, pantry, profile]) => {
        setWeekPlan(plan)
        setMealsData(md)
        setWishes(w)
        setAttendance(att)
        setShoppingList(sl)
        setProposals(pr)
        setActiveWochenchef(wc)
        setPlanConfirmed(pc)
        setFreezerItems(freezer)
        setPantryItems(pantry)
        setFamilyProfile(profile)
        setDataLoading(false)
      })
      .catch(err => {
        console.error('Ladefehler:', err)
        setDataLoading(false)
      })
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

  async function handleProposalsChange(newProposals: ChangeProposal[]) {
    setProposals(newProposals)
    await saveProposals(newProposals)
  }

  async function handleWochenchefChange(chef: Chef) {
    setActiveWochenchef(chef)
    await saveWochenchef(chef)
  }

  async function handlePlanConfirmedChange(confirmed: boolean) {
    setPlanConfirmed(confirmed)
    await savePlanConfirmed(confirmed)
  }

  async function handleShoppingListChange(list: ShoppingItem[]) {
    setShoppingList(list)
    await saveShoppingList(list)
  }

  async function handlePlanConfirm(confirmedEntries: WeekPlanEntry[]) {
    if (!familyProfile) return
    const today = new Date().toISOString().slice(0, 10)
    const updatedMembers = applyChefStats(familyProfile.members, confirmedEntries, today)
    const updated: FamilyProfile = { ...familyProfile, members: updatedMembers }
    setFamilyProfile(updated)
    await saveFamilyProfile(updated)
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
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
            currentUser={currentUser}
            wochenchef={activeWochenchef}
            members={members}
            attendance={attendance}
            proposals={proposals}
            onWeekPlanChange={handleWeekPlanChange}
            onWishesChange={handleWishesChange}
            onAttendanceChange={handleAttendanceChange}
            onPlanConfirm={handlePlanConfirm}
            planConfirmed={planConfirmed}
            onProposalsChange={handleProposalsChange}
            onWochenchefChange={handleWochenchefChange}
            onPlanConfirmedChange={handlePlanConfirmedChange}
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
            onShoppingListChange={handleShoppingListChange}
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
        <button className={`nav-tab${activeTab === 'woche' ? ' active' : ''}`} onClick={() => handleTabChange('woche')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span style={{ position: 'relative' }}>
            Woche
            {proposals.length > 0 && activeWochenchef === currentUser && (
              <span style={{ position: 'absolute', top: -1, right: -8, width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
            )}
          </span>
        </button>
        <button className={`nav-tab${activeTab === 'gefriertruhe' ? ' active' : ''}`} onClick={() => handleTabChange('gefriertruhe')}>
          <svg viewBox="0 0 24 24"><path d="M20 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>
          <span>Vorräte</span>
        </button>
        <button className={`nav-tab${activeTab === 'einkauf' ? ' active' : ''}`} onClick={() => handleTabChange('einkauf')}>
          <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
          <span>Einkauf</span>
        </button>
        <button className={`nav-tab${activeTab === 'rezepte' ? ' active' : ''}`} onClick={() => handleTabChange('rezepte')}>
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          <span>Profil</span>
        </button>
      </nav>
    </div>
  )
}
