'use client'
import { useState, useEffect, useRef } from 'react'
import { loadWeekPlan, saveWeekPlan, saveAttendance, saveShoppingList, saveProposals, saveWochenchef, savePlanConfirmed, saveShopDone, saveShoppingDays, saveShoppingPersons, loadLastDishes, getMondayIso, getNextMondayIso, saveWeekStart, loadNextWeekData, saveNextWeekData, activateNextWeek } from '../lib/mealLogic'
import { loadFreezerItems, loadPantryItems } from '../lib/freezerLogic'
import { loadFamilyProfile, saveFamilyProfile, applyChefStats, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { signOut, onAuthChange } from '../lib/auth'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab, Wish, Chef, FamilyProfile, DayAttendance, ChangeProposal, NextWeekData, NextWeekWish } from '../lib/state'
import LoginScreen from './LoginScreen'
import WocheScreen from './WocheScreen'
import VorraeteScreen from './VorraeteScreen'
import EinkaufScreen from './EinkaufScreen'
import ProfilScreen from './ProfilScreen'
import MehrScreen from './MehrScreen'
import OnboardingWizard from './OnboardingWizard'

export default function FamilyPlateApp() {
  const [currentUser, setCurrentUser] = useState<Chef | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const lastAuthUser = useRef<Chef | null>(null)

  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [attendance, setAttendance] = useState<DayAttendance[]>([])
  const [attendanceConfirmed, setAttendanceConfirmed] = useState<Chef[]>([])
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
  const [shopDone, setShopDone] = useState(false)
  const [shoppingDays, setShoppingDays] = useState<string[]>([])
  const [shoppingPersons, setShoppingPersons] = useState<Record<string, Chef>>({})
  const [lastDishes, setLastDishes] = useState<string[]>([])
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [nextWeekStart, setNextWeekStart] = useState<string | null>(null)
  const [nextWeekData, setNextWeekData] = useState<NextWeekData | null>(null)
  const [attendanceSignal, setAttendanceSignal] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('woche')
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)

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
        setShopDone(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUser) return
    Promise.all([loadWeekPlan(), loadFreezerItems(), loadPantryItems(), loadFamilyProfile(), loadNextWeekData()])
      .then(([{ plan, mealsData: md, wishes: w, attendance: att, attendanceConfirmed: ac, shoppingList: sl, proposals: pr, wochenchef: wc, planConfirmed: pc, shopDone: sd, shoppingDays: sd2, shoppingPersons: sp, weekStart: ws }, freezer, pantry, profile, { nextWeekStart: nws, nextWeekData: nwd }]) => {
        setWeekPlan(plan)
        setMealsData(md)
        setWishes(w)
        setAttendance(att)
        setAttendanceConfirmed(ac)
        setShoppingList(sl)
        setProposals(pr)
        setActiveWochenchef(wc)
        setPlanConfirmed(pc)
        setShopDone(sd)
        setShoppingDays(sd2)
        setShoppingPersons(sp)
        setWeekStart(ws)
        setNextWeekStart(nws)
        setNextWeekData(nwd)
        setFreezerItems(freezer)
        setPantryItems(pantry)
        setFamilyProfile(profile)
        setDataLoading(false)
        loadLastDishes().then(setLastDishes).catch(() => {})
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

  async function handleWeekPlanAndWishesChange(plan: WeekPlanEntry[], meals: Record<string, Rezept>, newWishes: Wish[]) {
    setWeekPlan(plan)
    setMealsData(meals)
    setWishes(newWishes)
    await saveWeekPlan(plan, meals, newWishes)
  }

  async function handleWishesChange(newWishes: Wish[]) {
    setWishes(newWishes)
    await saveWeekPlan(weekPlan, mealsData, newWishes)
  }

  async function handleAttendanceChange(newAttendance: DayAttendance[]) {
    setAttendance(newAttendance)
    await saveAttendance(newAttendance, attendanceConfirmed)
  }

  async function handleAttendanceConfirmedChange(newConfirmed: Chef[]) {
    setAttendanceConfirmed(newConfirmed)
    await saveAttendance(attendance, newConfirmed)
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

  async function handleShopDoneChange(done: boolean) {
    setShopDone(done)
    await saveShopDone(done)
  }

  async function handleShoppingDaysChange(days: string[]) {
    setShoppingDays(days)
    await saveShoppingDays(days)
  }

  async function handleShoppingPersonsChange(persons: Record<string, Chef>) {
    setShoppingPersons(persons)
    await saveShoppingPersons(persons)
  }

  async function handleShoppingProposalSubmit(proposal: ChangeProposal) {
    const updated = [...proposals, proposal]
    setProposals(updated)
    await saveProposals(updated)
  }

  async function handleShoppingListChange(list: ShoppingItem[]) {
    setShoppingList(list)
    await saveShoppingList(list)
  }

  async function handleZutatenLadenChange(mapping: Record<string, string>) {
    if (!familyProfile) return
    const updated: FamilyProfile = { ...familyProfile, zutatenLaden: mapping }
    setFamilyProfile(updated)
    await saveFamilyProfile(updated)
  }

  async function handleLaedenChange(newLaeden: string[]) {
    if (!familyProfile) return
    const updated: FamilyProfile = { ...familyProfile, laeden: newLaeden }
    setFamilyProfile(updated)
    await saveFamilyProfile(updated)
  }

  async function handlePlanConfirm(confirmedEntries: WeekPlanEntry[]) {
    if (!familyProfile) return
    const today = new Date().toISOString().slice(0, 10)
    const updatedMembers = applyChefStats(familyProfile.members, confirmedEntries, today)
    const updated: FamilyProfile = { ...familyProfile, members: updatedMembers }
    setFamilyProfile(updated)
    // Set week_start to current Monday when a plan is accepted
    const monday = getMondayIso()
    setWeekStart(monday)
    await saveWeekStart(monday)
    try {
      await saveFamilyProfile(updated)
    } catch (err) {
      setProfileSaveError('Profil-Speichern fehlgeschlagen – Chef-Statistik nicht aktualisiert.')
      console.error('saveFamilyProfile:', err)
    }
  }

  async function handleNextWeekDataChange(data: Partial<NextWeekData>, nextMonday: string) {
    const merged: NextWeekData = { wishes: [], ...nextWeekData, ...data, wochenchef: data.wochenchef ?? nextWeekData?.wochenchef ?? 'PA' }
    setNextWeekData(merged)
    setNextWeekStart(nextMonday)
    await saveNextWeekData(nextMonday, merged)
  }

  async function handleActivateNextWeek() {
    const { weekStart: newWs, nextWeekData: nwd } = await activateNextWeek()
    // Reload full state from DB
    const loaded = await loadWeekPlan()
    setWeekPlan(loaded.plan)
    setMealsData(loaded.mealsData)
    setWishes(loaded.wishes)
    setAttendance(loaded.attendance)
    setAttendanceConfirmed(loaded.attendanceConfirmed)
    setShoppingList(loaded.shoppingList)
    setProposals(loaded.proposals)
    setActiveWochenchef(loaded.wochenchef)
    setPlanConfirmed(loaded.planConfirmed)
    setShopDone(loaded.shopDone)
    setShoppingDays(loaded.shoppingDays)
    setShoppingPersons(loaded.shoppingPersons)
    setWeekStart(newWs ?? loaded.weekStart)
    setNextWeekStart(null)
    setNextWeekData(null)
    void nwd // used via DB reload
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
      {profileSaveError && (
        <div
          onClick={() => setProfileSaveError(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999, background: '#FEE2E2', borderBottom: '1px solid #FCA5A5', padding: '10px 14px', fontSize: 12, color: '#991B1B', cursor: 'pointer' }}
        >
          ⚠️ {profileSaveError}
        </div>
      )}
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
            attendanceConfirmed={attendanceConfirmed}
            proposals={proposals}
            onWeekPlanChange={handleWeekPlanChange}
            onWeekPlanAndWishesChange={handleWeekPlanAndWishesChange}
            onWishesChange={handleWishesChange}
            onAttendanceChange={handleAttendanceChange}
            onAttendanceConfirmedChange={handleAttendanceConfirmedChange}
            onPlanConfirm={handlePlanConfirm}
            planConfirmed={planConfirmed}
            shopDone={shopDone}
            onProposalsChange={handleProposalsChange}
            onWochenchefChange={handleWochenchefChange}
            onPlanConfirmedChange={handlePlanConfirmedChange}
            onShopDoneChange={handleShopDoneChange}
            shoppingList={shoppingList}
            onShoppingListChange={handleShoppingListChange}
            onFreezerChange={setFreezerItems}
            attendanceSignal={attendanceSignal}
            shoppingDays={shoppingDays}
            shoppingPersons={shoppingPersons}
            onShoppingPersonsChange={handleShoppingPersonsChange}
            lastDishes={lastDishes}
            weekStart={weekStart}
            nextWeekStart={nextWeekStart}
            nextWeekData={nextWeekData}
            onNextWeekDataChange={handleNextWeekDataChange}
            onActivateNextWeek={handleActivateNextWeek}
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
            currentUser={currentUser}
            wochenchef={activeWochenchef}
            shopDone={shopDone}
            onShopDoneChange={handleShopDoneChange}
            laeden={familyProfile.laeden}
            zutatenLaden={familyProfile.zutatenLaden}
            onZutatenLadenChange={handleZutatenLadenChange}
            shoppingDays={shoppingDays}
            nextWeekData={nextWeekData}
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
            laeden={familyProfile.laeden}
            onLaedenChange={handleLaedenChange}
          />
        )}
        {activeTab === 'mehr' && (
          <MehrScreen
            currentUser={currentUser}
            wochenchef={activeWochenchef}
            members={members}
            weekPlan={weekPlan}
            shoppingDays={shoppingDays}
            shoppingPersons={shoppingPersons}
            proposals={proposals}
            onShoppingDaysChange={handleShoppingDaysChange}
            onShoppingPersonsChange={handleShoppingPersonsChange}
            onShoppingProposalSubmit={handleShoppingProposalSubmit}
            onGoToAttendance={() => {
              setAttendanceSignal(prev => prev + 1)
              setActiveTab('woche')
            }}
          />
        )}
      </div>
      <nav className="nav">
        <button className={`nav-tab${activeTab === 'woche' ? ' active' : ''}`} onClick={() => handleTabChange('woche')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span style={{ position: 'relative' }}>
            Woche
            {activeWochenchef === currentUser && (proposals.length > 0 || wishes.some(w => w.postConfirm)) && (
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
        <button className={`nav-tab${activeTab === 'mehr' ? ' active' : ''}`} onClick={() => handleTabChange('mehr')}>
          <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
          <span>Mehr</span>
        </button>
      </nav>
    </div>
  )
}
