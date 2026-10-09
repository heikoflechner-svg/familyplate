'use client'
import { useState, useEffect, useRef } from 'react'
import { loadWeekPlan, saveWeekPlan, saveAttendance, saveShoppingList, saveProposals, saveWochenchef, savePlanConfirmed, saveShopDone, saveShoppingDays, saveShoppingPersons, loadLastDishes, getMondayIso, getNextMondayIso, saveWeekStart, loadNextWeekData, saveNextWeekData, activateNextWeek } from '../lib/mealLogic'
import { loadFreezerItems, loadPantryItems } from '../lib/freezerLogic'
import { loadFamilyProfile, saveFamilyProfile, applyChefStats, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { signOut, onAuthChange, SETUP_NEEDED } from '../lib/auth'
import { supabase, getFamilyId } from '../lib/supabase'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab, Wish, Chef, FamilyProfile, DayAttendance, ChangeProposal, NextWeekData, NextWeekWish, MemberRole } from '../lib/state'
import LoginScreen from './LoginScreen'
import RegisterScreen from './RegisterScreen'
import SetupScreen from './SetupScreen'
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
  const [editingWithProfile, setEditingWithProfile] = useState<FamilyProfile | null>(null)
  const [currentMemberRole, setCurrentMemberRole] = useState<MemberRole>('member')
  const [attendance, setAttendance] = useState<DayAttendance[]>([])
  const [attendanceConfirmed, setAttendanceConfirmed] = useState<Chef[]>([])
  const [weekPlan, setWeekPlan] = useState<WeekPlanEntry[]>([])
  const [mealsData, setMealsData] = useState<Record<string, Rezept>>({})
  const [mittagsloseTage, setMittagsloseTage] = useState<string[]>([])
  const [planWE, setPlanWE] = useState(true)
  const [freezerItems, setFreezerItems] = useState<FreezerItem[]>([])
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [wishes, setWishes] = useState<Wish[]>([])
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([])
  const [proposals, setProposals] = useState<ChangeProposal[]>([])
  const [activeWochenchef, setActiveWochenchef] = useState<Chef>('')
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [shopDone, setShopDone] = useState(false)
  const [shoppingDays, setShoppingDays] = useState<string[]>([])
  const [shoppingPersons, setShoppingPersons] = useState<Record<string, Chef>>({})
  const [lastDishes, setLastDishes] = useState<string[]>([])
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [nextWeekStart, setNextWeekStart] = useState<string | null>(null)
  const [nextWeekData, setNextWeekData] = useState<NextWeekData | null>(null)
  const [memberStatuses, setMemberStatuses] = useState<{ kuerzel: string; role: string; isLinked: boolean }[]>([])
  const [wocheInitView, setWocheInitView] = useState<'home' | 'attendance'>('home')
  const [attendanceReturnToMehr, setAttendanceReturnToMehr] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('woche')
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileLoadError, setProfileLoadError] = useState(false)
  const [loadTrigger, setLoadTrigger] = useState(0)

  useEffect(() => {
    return onAuthChange(chef => {
      const prev = lastAuthUser.current
      lastAuthUser.current = chef
      setCurrentUser(chef)
      setAuthChecked(true)
      if (chef && chef !== SETUP_NEEDED) {
        // Only start the loading spinner when the user actually changes (avoids
        // re-firing on TOKEN_REFRESHED / SIGNED_IN after data is already loaded)
        if (prev !== chef) setDataLoading(true)
      } else if (!chef) {
        setDataLoading(false)
        setActiveTab('woche')
        setAuthView('login')
        setWeekPlan([])
        setMealsData({})
        setWishes([])
        setFreezerItems([])
        setPantryItems([])
        setShoppingList([])
        setFamilyProfile(null)
        setCurrentMemberRole('member')
        setProposals([])
        setActiveWochenchef('')
        setPlanConfirmed(false)
        setShopDone(false)
        setMemberStatuses([])
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUser || currentUser === SETUP_NEEDED) return
    const doLoad = async () => {
      setProfileLoadError(false)
      const [loaded, freezer, pantry, profile, nwLoaded, roleData, memberSts] = await Promise.all([
        loadWeekPlan(), loadFreezerItems(), loadPantryItems(), loadFamilyProfile(), loadNextWeekData(),
        supabase.from('family_members').select('role').eq('family_id', getFamilyId()).eq('kuerzel', currentUser!).maybeSingle(),
        (async (): Promise<{ kuerzel: string; role: string; isLinked: boolean }[]> => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return []
            const res = await fetch('/api/members/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
            if (!res.ok) return []
            const json = await res.json() as { members?: { kuerzel: string; role: string; isLinked: boolean }[] }
            return json.members ?? []
          } catch { return [] }
        })(),
      ])
      let planData = loaded
      let nwData = nwLoaded
      // Auto-activate next week when the stored weekStart is from a past week
      if (loaded.weekStart && loaded.weekStart < getMondayIso()) {
        await activateNextWeek()
        const [reloaded, nwReloaded] = await Promise.all([loadWeekPlan(), loadNextWeekData()])
        planData = reloaded
        nwData = nwReloaded
        const memberList = profile?.members ?? []
        if (memberList.length > 0 && !memberList.some(m => m.id === planData.wochenchef)) {
          const prevChef = loaded.wochenchef
          const ownerKuerzel = memberSts.find(s => s.role === 'owner')?.kuerzel
          const eligibleList = memberSts.length > 0
            ? memberList.filter(m => { const s = memberSts.find(x => x.kuerzel === m.id); return !!(s?.isLinked && s.role !== 'parent') })
            : []
          const candidateList = eligibleList.length > 0
            ? eligibleList
            : (ownerKuerzel ? memberList.filter(m => m.id === ownerKuerzel) : memberList)
          const fallback = ([...candidateList]
            .sort((a, b) => (a.chefStat?.count ?? 0) - (b.chefStat?.count ?? 0))
            .find(m => m.id !== prevChef) ?? candidateList[0])?.id as Chef | undefined
          if (fallback) {
            await saveWochenchef(fallback)
            planData = { ...planData, wochenchef: fallback }
          }
        }
      }
      const { plan, mealsData: md, wishes: w, attendance: att, attendanceConfirmed: ac, shoppingList: sl, proposals: pr, wochenchef: wc, planConfirmed: pc, shopDone: sd, shoppingDays: sd2, shoppingPersons: sp, weekStart: ws } = planData
      const { nextWeekStart: nws, nextWeekData: nwd } = nwData
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
      setCurrentMemberRole((roleData.data?.role as MemberRole | null) ?? 'member')
      setMemberStatuses(memberSts)
      setDataLoading(false)
      loadLastDishes().then(setLastDishes).catch(() => {})
    }
    doLoad().catch(err => {
      console.error('Ladefehler:', err)
      setProfileLoadError(true)
      setDataLoading(false)
    })
  // loadTrigger: incremented by retry button to re-run this effect without user change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, loadTrigger])

  useEffect(() => {
    try {
      const m = localStorage.getItem('fp_mittagsloseTage')
      if (m) setMittagsloseTage(JSON.parse(m))
    } catch {}
    try {
      const w = localStorage.getItem('fp_planWE')
      if (w !== null) setPlanWE(w !== 'false')
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('fp_mittagsloseTage', JSON.stringify(mittagsloseTage)) } catch {}
  }, [mittagsloseTage])

  useEffect(() => {
    try { localStorage.setItem('fp_planWE', planWE ? 'true' : 'false') } catch {}
  }, [planWE])

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

  async function handleMealsDataChange(meals: Record<string, Rezept>) {
    setMealsData(meals)
    await saveWeekPlan(weekPlan, meals, wishes)
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
    const previous = familyProfile
    const updated: FamilyProfile = { ...familyProfile, zutatenLaden: mapping }
    setFamilyProfile(updated)
    try {
      const saved = await saveFamilyProfile(updated)
      setFamilyProfile(saved)
    } catch (err) {
      setFamilyProfile(previous)
      setProfileSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  async function handleLaedenChange(newLaeden: string[]) {
    if (!familyProfile) return
    const previous = familyProfile
    const updated: FamilyProfile = { ...familyProfile, laeden: newLaeden }
    setFamilyProfile(updated)
    try {
      const saved = await saveFamilyProfile(updated)
      setFamilyProfile(saved)
    } catch (err) {
      setFamilyProfile(previous)
      setProfileSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
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
      const saved = await saveFamilyProfile(updated)
      setFamilyProfile(saved)
    } catch (err) {
      setProfileSaveError('Profil-Speichern fehlgeschlagen – Chef-Statistik nicht aktualisiert.')
      console.error('saveFamilyProfile:', err)
    }
  }

  async function handleNextWeekDataChange(data: Partial<NextWeekData>, nextMonday: string) {
    const merged: NextWeekData = { wishes: [], ...nextWeekData, ...data, wochenchef: data.wochenchef ?? nextWeekData?.wochenchef ?? activeWochenchef }
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
    if (tab !== 'woche') setWocheInitView('home')
    setActiveTab(tab)
  }

  if (!authChecked || dataLoading) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🐀</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Lade MenuFamPlan…</div>
      </div>
    )
  }

  if (!currentUser) {
    if (authView === 'register') {
      return <RegisterScreen onBack={() => setAuthView('login')} />
    }
    return <LoginScreen onRegister={() => setAuthView('register')} />
  }

  if (currentUser === SETUP_NEEDED) {
    return <SetupScreen />
  }

  if (profileLoadError) {
    return (
      <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#991B1B' }}>Ladefehler</div>
        <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
          MenuFamPlan konnte nicht geladen werden — möglicherweise ein Verbindungsproblem oder ein laufendes Update.
        </div>
        <button
          onClick={() => { setDataLoading(true); setLoadTrigger(t => t + 1) }}
          style={{ marginTop: 4, padding: '11px 28px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  if (!familyProfile) {
    return (
      <OnboardingWizard
        key="onboarding"
        ownerKuerzel={currentUser!}
        onDone={profile => {
          setFamilyProfile(profile)
          void handleWochenchefChange(currentUser!)
        }}
      />
    )
  }

  if (editingWithProfile) {
    return (
      <OnboardingWizard
        key="edit"
        initialProfile={editingWithProfile}
        onDone={profile => { setFamilyProfile(profile); setEditingWithProfile(null) }}
        onCancel={() => setEditingWithProfile(null)}
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
        <span>🍽 MenuFamPlan</span>
        <span style={{ fontSize: 10, color: '#aaa' }}>{currentName}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: activeTab === 'woche' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <WocheScreen
            weekPlan={weekPlan}
            mealsData={mealsData}
            mittagsloseTage={mittagsloseTage}
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
            initialView={wocheInitView}
            onInitialViewConsumed={() => setWocheInitView('home')}
            shoppingDays={shoppingDays}
            shoppingPersons={shoppingPersons}
            onShoppingPersonsChange={handleShoppingPersonsChange}
            lastDishes={lastDishes}
            weekStart={weekStart}
            nextWeekStart={nextWeekStart}
            nextWeekData={nextWeekData}
            onNextWeekDataChange={handleNextWeekDataChange}
            onActivateNextWeek={handleActivateNextWeek}
            onAttendanceBack={attendanceReturnToMehr ? () => { setAttendanceReturnToMehr(false); setWocheInitView('home'); setActiveTab('mehr') } : undefined}
            canEditSettings={currentMemberRole !== 'member'}
            memberStatuses={memberStatuses}
          />
        </div>
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
            onMealsDataChange={handleMealsDataChange}
            currentUser={currentUser}
            wochenchef={activeWochenchef}
            shopDone={shopDone}
            onShopDoneChange={handleShopDoneChange}
            laeden={familyProfile.laeden}
            zutatenLaden={familyProfile.zutatenLaden}
            onZutatenLadenChange={handleZutatenLadenChange}
            canEditSettings={currentMemberRole !== 'member'}
            shoppingDays={shoppingDays}
            nextWeekData={nextWeekData}
            freezerItems={freezerItems}
            pantryItems={pantryItems}
            members={members}
          />
        )}
        {activeTab === 'rezepte' && (
          <ProfilScreen
            currentUser={currentUser}
            familyProfile={familyProfile}
            currentMemberRole={currentMemberRole}
            onSignOut={signOut}
            onEditProfile={(filteredProfile) => setEditingWithProfile(filteredProfile)}
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
              setWocheInitView('attendance')
              setAttendanceReturnToMehr(true)
              setActiveTab('woche')
            }}
            nextWeekData={nextWeekData}
            nextWeekStart={nextWeekStart}
            onWochenchefChange={handleWochenchefChange}
            onNextWeekDataChange={handleNextWeekDataChange}
            mittagsloseTage={mittagsloseTage}
            planWE={planWE}
            onMittagsloseTageChange={setMittagsloseTage}
            onPlanWEChange={setPlanWE}
            laeden={familyProfile.laeden}
            onLaedenChange={handleLaedenChange}
            canEditSettings={currentMemberRole !== 'member'}
            memberStatuses={memberStatuses}
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
