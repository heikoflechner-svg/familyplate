'use client'
import { useState, useEffect, useRef } from 'react'
import { loadWeekPlan, saveWeekPlan, saveAttendance, saveShoppingList, saveProposals, saveWochenchef, savePlanConfirmed, saveShopDone, saveShoppingDays, saveShoppingPersons, loadLastDishes, getMondayIso, getNextMondayIso, saveWeekStart, loadNextWeekData, saveNextWeekData, activateNextWeek, buildDefaultAttendance, loadMissingRecipes, getPersonCountForSlot } from '../lib/mealLogic'
import { needsMigration, migrateMealsDataAddSlotKeys } from '../lib/mealsDataUtils'
import { loadFreezerItems, loadPantryItems, getFreezerListString, getPantryListString } from '../lib/freezerLogic'
import { loadFamilyProfile, saveFamilyProfile, saveShoppingConfig, applyChefStats, incrementWochenchefStat, DEFAULT_MEMBERS, buildFamilyPrompt } from '../lib/familyLogic'
import { generateShoppingList } from '../lib/shoppingLogic'
import { signOut, onAuthChange, SETUP_NEEDED } from '../lib/auth'
import { saveIdentity, saveDataCache, loadDataCache, appendPendingOps, loadPendingOps, clearPendingOps, addDeletedIds, loadDeletedIds, clearDeletedIds, clearAllOfflineData, type PendingOp } from '../lib/offlineCache'
import { mergeShoppingLists, applyPendingOps } from '../lib/shoppingMerge'
import { supabase, getFamilyId } from '../lib/supabase'
import { loadRezeptbuch, saveRezeptToBook, updateRezeptInBook, deleteRezeptFromBook, toggleFavoritInBook, markGekochtInBook, autoSaveRezeptToBook, setVermeidenByName } from '../lib/rezeptbuchLogic'
import { loadDishRatings, saveDishRating, computeRatingAvg, type DishRating } from '../lib/dishRatingsLogic'
import type { WeekPlanEntry, Rezept, FreezerItem, PantryItem, ShoppingItem, Tab, Wish, Chef, FamilyProfile, DayAttendance, ChangeProposal, NextWeekData, NextWeekWish, MemberRole, PlanSettings, WochenSlot, RezeptbuchEntry } from '../lib/state'
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
  const [planWE, setPlanWE] = useState(false)
  const [planSettings, setPlanSettings] = useState<PlanSettings | null>(null)
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
  const [rezeptbuchEntries, setRezeptbuchEntries] = useState<RezeptbuchEntry[]>([])
  const [dishRatings, setDishRatings] = useState<DishRating[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('woche')
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileLoadError, setProfileLoadError] = useState(false)
  const [loadTrigger, setLoadTrigger] = useState(0)
  const [isOffline, setIsOffline] = useState(false)
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null)
  const [syncDone, setSyncDone] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [swUpdateWaiting, setSwUpdateWaiting] = useState(false)
  const lastDbShoppingListRef = useRef<ShoppingItem[]>([])
  const lastFocusReloadRef = useRef<number>(0)
  const latestRef = useRef({ currentUser, shoppingList, weekPlan, mealsData, wishes, familyProfile })
  latestRef.current = { currentUser, shoppingList, weekPlan, mealsData, wishes, familyProfile }

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
        setIsOffline(false)
        setPendingCount(0)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUser || currentUser === SETUP_NEEDED) return
    const doLoad = async () => {
      setProfileLoadError(false)

      // Offline-Fallback: Lade aus dem Cache, wenn kein Netz vorhanden ist
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cache = loadDataCache()
        if (cache) {
          setShoppingList(cache.shoppingList)
          lastDbShoppingListRef.current = cache.shoppingList
          setWeekPlan(cache.weekPlan)
          setMealsData(cache.mealsData)
          if (cache.familyProfile) setFamilyProfile(cache.familyProfile)
          setOfflineCachedAt(cache.savedAt)
          setIsOffline(true)
          setPendingCount(loadPendingOps().length)
          setDataLoading(false)
          return
        }
        setProfileLoadError(true)
        setDataLoading(false)
        return
      }

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
      let latestProfile = profile

      // Guard: loadFamilyProfile() gibt bei Netzwerk-/Auth-Fehler null zurück (wirft nicht).
      // Null-Profil für einen angemeldeten Nutzer bedeutet immer einen Ladefehler –
      // nie Onboarding zeigen. Cache als Fallback, sonst Fehlermeldung.
      if (!latestProfile) {
        const cachedFp = loadDataCache()?.familyProfile
        if (cachedFp) {
          latestProfile = cachedFp
        } else {
          setProfileLoadError(true)
          setDataLoading(false)
          return
        }
      }

      // Auto-activate next week when the stored weekStart is from a past week
      if (loaded.weekStart && loaded.weekStart < getMondayIso()) {
        await activateNextWeek()
        if (latestProfile && loaded.wochenchef && (latestProfile.members ?? []).some(m => m.id === loaded.wochenchef)) {
          const inc = await incrementWochenchefStat(loaded.wochenchef as Chef, loaded.weekStart, latestProfile).catch(() => null)
          if (inc) latestProfile = inc
        }
        const [reloaded, nwReloaded] = await Promise.all([loadWeekPlan(), loadNextWeekData()])
        planData = reloaded
        nwData = nwReloaded
        const memberList = latestProfile?.members ?? []
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
            .sort((a, b) => (a.wochenchefStat?.count ?? 0) - (b.wochenchefStat?.count ?? 0))
            .find(m => m.id !== prevChef) ?? candidateList[0])?.id as Chef | undefined
          if (fallback) {
            await saveWochenchef(fallback)
            planData = { ...planData, wochenchef: fallback }
          }
        }
      }
      const { plan, mealsData: md, wishes: w, attendance: att, attendanceConfirmed: ac, shoppingList: sl, proposals: pr, wochenchef: wc, planConfirmed: pc, shopDone: sd, shoppingDays: sd2, shoppingPersons: sp, weekStart: ws, planSettings: ps } = planData
      const { nextWeekStart: nws, nextWeekData: nwd } = nwData

      // Derive effective planWE from plan entries when planSettings is null (already-planned weeks)
      const effectivePlanWE = ps?.planWE ?? plan.some(e => e.tag === 'Samstag' || e.tag === 'Sonntag')
      const effectiveMtl = ps?.mittagsloseTage ?? []

      // localStorage migration: only when planSettings is null and no plan exists yet
      let resolvedPs = ps
      if (ps === null && plan.length === 0) {
        try {
          const lsMt = localStorage.getItem('fp_mittagsloseTage')
          const lsPw = localStorage.getItem('fp_planWE')
          if (lsMt !== null || lsPw !== null) {
            const migSettings: PlanSettings = {
              mittagsloseTage: lsMt ? JSON.parse(lsMt) as string[] : [],
              planWE: lsPw !== null ? lsPw !== 'false' : false,
            }
            const { data: { session: sess } } = await supabase.auth.getSession()
            if (sess?.access_token) {
              fetch('/api/plan-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.access_token}` },
                body: JSON.stringify({ settings: migSettings, weekType: 'current' }),
              }).catch(() => {})
              try { localStorage.removeItem('fp_mittagsloseTage'); localStorage.removeItem('fp_planWE') } catch {}
              resolvedPs = migSettings
            }
          }
        } catch {}
      }

      let resolvedAtt = att
      if (att.length === 0 && plan.length === 0 && latestProfile) {
        resolvedAtt = buildDefaultAttendance(latestProfile.members, latestProfile.defaultMealConfig, latestProfile.defaultPlanWE)
        saveAttendance(resolvedAtt, []).catch(() => {})
      }
      setWeekPlan(plan)
      const migratedMd = needsMigration(plan, md) ? migrateMealsDataAddSlotKeys(plan, md) : md
      if (migratedMd !== md) void saveWeekPlan(plan, migratedMd, w)
      setMealsData(migratedMd)
      setWishes(w)
      setAttendance(resolvedAtt)
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
      if (nwd?.plan && nwd?.mealsData && needsMigration(nwd.plan, nwd.mealsData)) {
        const migratedNwMeals = migrateMealsDataAddSlotKeys(nwd.plan, nwd.mealsData)
        const migratedNwd = { ...nwd, mealsData: migratedNwMeals }
        setNextWeekData(migratedNwd)
        void saveNextWeekData(nws ?? getNextMondayIso(), migratedNwd)
      } else {
        setNextWeekData(nwd)
      }
      setPlanSettings(resolvedPs)
      setMittagsloseTage(resolvedPs?.mittagsloseTage ?? effectiveMtl)
      setPlanWE(resolvedPs?.planWE ?? effectivePlanWE)
      setFreezerItems(freezer)
      setPantryItems(pantry)
      setFamilyProfile(latestProfile)
      setCurrentMemberRole((roleData.data?.role as MemberRole | null) ?? 'member')
      setMemberStatuses(memberSts)
      setIsOffline(false)
      lastDbShoppingListRef.current = sl
      saveDataCache({ shoppingList: sl, weekPlan: plan, mealsData: migratedMd, familyProfile: latestProfile, savedAt: new Date().toISOString() })
      // fp_identity nach jedem erfolgreichen Online-Laden aktualisieren, damit der
      // Offline-Kaltstart auch ohne vorherigen neuen Login funktioniert.
      saveIdentity({ familyId: getFamilyId(), kuerzel: currentUser! })
      setDataLoading(false)
      loadLastDishes().then(setLastDishes).catch(() => {})
      loadRezeptbuch().then(entries => { if (entries !== null) setRezeptbuchEntries(entries) }).catch(() => {})
      loadDishRatings().then(setDishRatings).catch(() => {})
      // Recovery: if plan is confirmed but shopping list was lost (e.g. app closed during recipe load)
      if (pc && sl.length === 0 && plan.length > 0 && latestProfile) {
        const mbs = latestProfile.members.length ? latestProfile.members : DEFAULT_MEMBERS
        const fp = buildFamilyPrompt(mbs)
        const acm = mbs.filter(m => m.allergien.length > 0).map(m => ({ name: m.name, allergien: m.allergien }))
        const frzStr = getFreezerListString(freezer)
        const pntStr = getPantryListString(pantry)
        const pcCb = (t: string, s: string) => getPersonCountForSlot(t, s as WochenSlot, resolvedAtt, mbs)
        void loadMissingRecipes(plan, md, frzStr, pntStr, fp, pcCb, acm)
          .then(rawFull => {
            const full = migrateMealsDataAddSlotKeys(plan, rawFull)
            const list = generateShoppingList(plan, full)
            setShoppingList(list)
            setMealsData(full)
            void saveShoppingList(list)
            void saveWeekPlan(plan, full, w)
          })
      }
    }
    doLoad().catch(err => {
      console.error('Ladefehler:', err)
      setProfileLoadError(true)
      setDataLoading(false)
    })
  // loadTrigger: incremented by retry button to re-run this effect without user change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, loadTrigger])

  // Online / offline / visibility change handlers (registered once, use latestRef for fresh state)
  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false)
      const { currentUser: cu, familyProfile: fp } = latestRef.current

      // Verify the Supabase session survived the offline period.
      // Some Supabase versions clear the session from localStorage when a token
      // refresh fails – in that case the user must re-authenticate.
      if (cu && cu !== SETUP_NEEDED) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            // Session was lost while offline → clear cached data and show login
            clearAllOfflineData()
            setCurrentUser(null)
            return
          }
        } catch {
          // Cannot verify right now – proceed and let the next DB call handle auth errors
        }
      }

      const ops = loadPendingOps()
      if (ops.length > 0 && cu && cu !== SETUP_NEEDED) {
        try {
          const loaded = await loadWeekPlan()
          const applied = applyPendingOps(loaded.shoppingList, ops)
          lastDbShoppingListRef.current = applied
          setShoppingList(applied)
          await saveShoppingList(applied)
          clearPendingOps()
          clearDeletedIds()
          setPendingCount(0)
          saveDataCache({ shoppingList: applied, weekPlan: loaded.plan, mealsData: loaded.mealsData, familyProfile: fp, savedAt: new Date().toISOString() })
        } catch { /* Silent – nächste Verbindung versucht es erneut */ }
      }
      setSyncDone(true)
      setTimeout(() => setSyncDone(false), 2500)
    }
    const handleOffline = () => setIsOffline(true)
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      const { currentUser: cu, shoppingList: sl } = latestRef.current
      if (!navigator.onLine || !cu || cu === SETUP_NEEDED) return
      const el = document.activeElement as HTMLElement | null
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      const now = Date.now()
      if (now - lastFocusReloadRef.current < 30_000) return
      lastFocusReloadRef.current = now
      try {
        const loaded = await loadWeekPlan()
        const deletedIds = loadDeletedIds()
        const merged = mergeShoppingLists(loaded.shoppingList, sl, deletedIds)
        lastDbShoppingListRef.current = loaded.shoppingList
        setShoppingList(merged)
        setWeekPlan(loaded.plan)
        setMealsData(loaded.mealsData)
        setWishes(loaded.wishes)
      } catch { /* Silent */ }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Service Worker registration + update detection
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // A waiting SW means a new version was installed while this page was open
      if (reg.waiting) setSwUpdateWaiting(true)
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          // Show banner only for updates (not first install), i.e. a previous SW exists
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setSwUpdateWaiting(true)
          }
        })
      })
    }).catch(() => { /* SW registration is a progressive enhancement – ignore failures */ })
    // When the new SW takes control (after SKIP_WAITING), reload to load new assets
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
  }, [])

  function handleSwUpdate() {
    navigator.serviceWorker.ready.then(reg => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }))
  }

  async function handlePlanSettingsChange(settings: PlanSettings, weekType: 'current' | 'next') {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch('/api/plan-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ settings, weekType }),
      })
      if (!res.ok) return
      if (weekType === 'current') {
        setPlanSettings(settings)
        setMittagsloseTage(settings.mittagsloseTage ?? [])
        setPlanWE(settings.planWE ?? false)
      } else {
        const merged: NextWeekData = { wishes: [], ...nextWeekData, wochenchef: nextWeekData?.wochenchef ?? activeWochenchef, planSettings: settings }
        setNextWeekData(merged)
      }
    } catch {}
  }

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
    const newIds = new Set(list.map(i => i.id))
    const removedIds = shoppingList.filter(i => !newIds.has(i.id)).map(i => i.id)
    if (removedIds.length > 0) addDeletedIds(removedIds)

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Offline: Änderungen als Pending-Ops speichern und lokal anwenden
      const ops: PendingOp[] = []
      for (const item of list) {
        const prev = shoppingList.find(i => i.id === item.id)
        if (!prev || prev.erledigt !== item.erledigt || prev.name !== item.name || prev.menge !== item.menge)
          ops.push({ type: 'update', item })
      }
      for (const id of removedIds) ops.push({ type: 'delete', id, deletedAt: new Date().toISOString() })
      if (ops.length > 0) {
        appendPendingOps(ops)
        setPendingCount(loadPendingOps().length)
      }
      setShoppingList(list)
      saveDataCache({ shoppingList: list, weekPlan, mealsData, familyProfile, savedAt: new Date().toISOString() })
      return
    }

    // Online: gegen letzten bekannten DB-Stand mergen und speichern
    const deletedIds = loadDeletedIds()
    const merged = mergeShoppingLists(lastDbShoppingListRef.current, list, deletedIds)
    lastDbShoppingListRef.current = merged
    setShoppingList(merged)
    await saveShoppingList(merged)
    saveDataCache({ shoppingList: merged, weekPlan, mealsData, familyProfile, savedAt: new Date().toISOString() })
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

  async function handleZutatenWarengruppeChange(mapping: Record<string, string>) {
    if (!familyProfile) return
    const previous = familyProfile
    const updated: FamilyProfile = { ...familyProfile, zutatenWarengruppe: mapping }
    setFamilyProfile(updated)
    try {
      await saveShoppingConfig(mapping, familyProfile.zutatenAliase ?? {})
    } catch {
      setFamilyProfile(previous)
    }
  }

  async function handleZutatenAliasChange(aliase: Record<string, string>) {
    if (!familyProfile) return
    const previous = familyProfile
    const updated: FamilyProfile = { ...familyProfile, zutatenAliase: aliase }
    setFamilyProfile(updated)
    try {
      await saveShoppingConfig(familyProfile.zutatenWarengruppe ?? {}, aliase)
    } catch {
      setFamilyProfile(previous)
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

  async function handleDefaultMealConfigChange(
    defaultMealConfig: NonNullable<FamilyProfile['defaultMealConfig']>,
    defaultPlanWE: boolean,
  ) {
    if (!familyProfile) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    setFamilyProfile({ ...familyProfile, defaultMealConfig, defaultPlanWE })
    await fetch('/api/family/save-default-meal-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ defaultMealConfig, defaultPlanWE }),
    })
  }

  async function handleSaveToBook(rezept: Rezept) {
    if (!currentUser) return
    const duplicate = rezeptbuchEntries.find(e => e.rezept.name.toLowerCase() === rezept.name.toLowerCase())
    if (duplicate) {
      const replace = window.confirm(`"${rezept.name}" ist bereits im Rezeptbuch.\nOK = Rezept ersetzen · Abbrechen = als zweite Version speichern`)
      if (replace) {
        await updateRezeptInBook(duplicate.id, rezept)
        setRezeptbuchEntries(prev => prev.map(e => e.id === duplicate.id ? { ...e, rezept } : e))
      } else {
        const saved = await saveRezeptToBook(rezept, currentUser)
        if (saved) setRezeptbuchEntries(prev => [saved, ...prev])
      }
    } else {
      const saved = await saveRezeptToBook(rezept, currentUser)
      if (saved) setRezeptbuchEntries(prev => [saved, ...prev])
    }
  }

  async function handleUpdateRezeptInBook(id: string, rezept: Rezept) {
    await updateRezeptInBook(id, rezept)
    setRezeptbuchEntries(prev => prev.map(e => e.id === id ? { ...e, rezept } : e))
  }

  async function handleToggleFavorit(id: string, isFavorit: boolean) {
    await toggleFavoritInBook(id, isFavorit)
    setRezeptbuchEntries(prev => prev.map(e => e.id === id ? { ...e, isFavorit } : e))
  }

  async function handleDeleteRezept(id: string) {
    await deleteRezeptFromBook(id)
    setRezeptbuchEntries(prev => prev.filter(e => e.id !== id))
  }

  function handleMarkGekocht(id: string) {
    void markGekochtInBook(id)
    setRezeptbuchEntries(prev => prev.map(e => e.id === id ? {
      ...e, malGekocht: e.malGekocht + 1, zuletztGekocht: new Date().toISOString().slice(0, 10)
    } : e))
  }

  async function handleRateGericht(gerName: string, sterne: number, memberOverride?: Chef, rezept?: Rezept) {
    const ratingMember = memberOverride ?? currentUser!
    const saved = await saveDishRating(gerName, ratingMember, sterne)
    if (!saved) return
    let updatedForDish: DishRating[] = []
    setDishRatings(prev => {
      const filtered = prev.filter(r => !(r.gerName.toLowerCase() === gerName.toLowerCase() && r.member === ratingMember))
      const next = [...filtered, saved]
      updatedForDish = next.filter(r => r.gerName.toLowerCase() === gerName.toLowerCase())
      return next
    })
    // Use current snapshot to compute avg (state setter is async but we computed updatedForDish above)
    const currentForDish = dishRatings.filter(r => r.gerName.toLowerCase() !== gerName.toLowerCase() || r.member !== ratingMember)
    const allForDish = [...currentForDish, saved].filter(r => r.gerName.toLowerCase() === gerName.toLowerCase())
    if (!allForDish.length) return
    const avg = allForDish.reduce((a, r) => a + r.sterne, 0) / allForDish.length
    if (avg >= 3 && rezept) {
      const bookEntry = await autoSaveRezeptToBook(gerName, rezept, currentUser!)
      if (bookEntry) setRezeptbuchEntries(prev => [bookEntry, ...prev])
    }
    if (allForDish.length >= 2 && avg <= 2) {
      await setVermeidenByName(gerName, true)
      setRezeptbuchEntries(prev => prev.map(e =>
        e.rezept.name.toLowerCase() === gerName.toLowerCase() ? { ...e, vermeiden: true } : e,
      ))
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
    let att = loaded.attendance
    const currentProfile = familyProfile
    if (att.length === 0 && currentProfile && loaded.plan.length === 0) {
      att = buildDefaultAttendance(currentProfile.members, currentProfile.defaultMealConfig, currentProfile.defaultPlanWE)
      await saveAttendance(att, [])
    }
    setWeekPlan(loaded.plan)
    setMealsData(loaded.mealsData)
    setWishes(loaded.wishes)
    setAttendance(att)
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
    // SICHERHEIT: Onboarding ("Familie erstellen") NIEMALS offline zeigen.
    // Ein fehlgeschlagenes Laden wegen fehlender Verbindung darf nicht als
    // "keine Familie vorhanden" interpretiert werden.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return (
        <div className="phone" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>📵</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>Keine Verbindung</div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
            Familienprofil kann offline nicht geladen werden. Bitte Internetverbindung herstellen.
          </div>
        </div>
      )
    }
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
      {(isOffline || syncDone) && (
        <div style={{
          background: syncDone ? '#D1FAE5' : '#FEF9C3',
          borderBottom: `1px solid ${syncDone ? '#A7F3D0' : '#FDE68A'}`,
          padding: '7px 14px',
          fontSize: 12,
          color: syncDone ? '#065F46' : '#78350F',
          fontWeight: 500,
          lineHeight: 1.4,
        }}>
          {syncDone
            ? '✓ Wieder verbunden – alles abgeglichen'
            : pendingCount > 0
              ? `Keine Verbindung · ${pendingCount} Änderung${pendingCount !== 1 ? 'en' : ''} werden übertragen, sobald Netz vorhanden`
              : `Keine Internetverbindung – Stand: ${offlineCachedAt ? new Date(offlineCachedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '…'}`
          }
        </div>
      )}
      {swUpdateWaiting && !isOffline && (
        <div
          role="button"
          onClick={handleSwUpdate}
          style={{
            background: '#EFF6FF',
            borderBottom: '1px solid #BFDBFE',
            padding: '7px 14px',
            fontSize: 12,
            color: '#1E40AF',
            fontWeight: 500,
            lineHeight: 1.4,
            cursor: 'pointer',
          }}
        >
          Neue Version verfügbar – antippen zum Laden ↺
        </div>
      )}
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
            planSettings={planSettings}
            onPlanSettingsChange={handlePlanSettingsChange}
            canEditSettings={currentMemberRole !== 'member'}
            defaultMealConfig={familyProfile?.defaultMealConfig}
            defaultPlanWE={familyProfile?.defaultPlanWE}
            memberStatuses={memberStatuses}
            onGoToMehr={() => setActiveTab('mehr')}
            rezeptbuchEntries={rezeptbuchEntries}
            onSaveToBook={handleSaveToBook}
            onMarkGekocht={handleMarkGekocht}
            dishRatings={dishRatings}
            onRateGericht={handleRateGericht}
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
            zutatenWarengruppe={familyProfile.zutatenWarengruppe}
            zutatenAliase={familyProfile.zutatenAliase}
            onZutatenWarengruppeChange={handleZutatenWarengruppeChange}
            onZutatenAliasChange={handleZutatenAliasChange}
            canEditSettings={currentMemberRole !== 'member'}
            planConfirmed={planConfirmed}
            attendance={attendance}
            shoppingDays={shoppingDays}
            nextWeekData={nextWeekData}
            freezerItems={freezerItems}
            pantryItems={pantryItems}
            members={members}
            onNextWeekDataChange={handleNextWeekDataChange}
            weekStart={weekStart}
            nextWeekStart={nextWeekStart}
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
            nextWeekData={nextWeekData}
            nextWeekStart={nextWeekStart}
            onWochenchefChange={handleWochenchefChange}
            onNextWeekDataChange={handleNextWeekDataChange}
            laeden={familyProfile.laeden}
            onLaedenChange={handleLaedenChange}
            canEditSettings={currentMemberRole !== 'member'}
            memberStatuses={memberStatuses}
            defaultMealConfig={familyProfile.defaultMealConfig}
            defaultPlanWE={familyProfile.defaultPlanWE ?? false}
            onDefaultMealConfigChange={handleDefaultMealConfigChange}
            rezeptbuchEntries={rezeptbuchEntries}
            mealsData={mealsData}
            weekStart={weekStart}
            attendance={attendance}
            onRbSaveToBook={handleSaveToBook}
            onRbUpdateRezept={handleUpdateRezeptInBook}
            onRbToggleFavorit={handleToggleFavorit}
            onRbDeleteRezept={handleDeleteRezept}
            onRbMarkGekocht={handleMarkGekocht}
            dishRatings={dishRatings}
            onRbRateGericht={handleRateGericht}
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
