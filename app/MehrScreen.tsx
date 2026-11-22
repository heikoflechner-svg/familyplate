'use client'
import { useState, useEffect } from 'react'
import type { Chef, FamilyMember, ChangeProposal, WeekPlanEntry, NextWeekData, TagMahlzeitenKonfig, MittagTyp, AbendTyp, Rezept, DayAttendance, RezeptbuchEntry, ErnährungsVorgabe } from '../lib/state'
import type { DishRating } from '../lib/dishRatingsLogic'
import { buildMemberCfg, DEFAULT_MEMBERS } from '../lib/familyLogic'
import { getNextMondayIso, loadWeekHistory } from '../lib/mealLogic'
import { supabase } from '../lib/supabase'
import RezeptbuchScreen from './RezeptbuchScreen'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buf = new ArrayBuffer(rawData.length)
  const output = new Uint8Array(buf)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return buf
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function getKW(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  const days = Math.round((thu.getTime() - yearStart.getTime()) / 86400000)
  return Math.ceil((days + 1) / 7)
}
const TAG_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
}


type View = 'overview' | 'einkauf' | 'wochenchef' | 'verlauf' | 'standardwoche' | 'rezeptbuch' | 'push'

type HistoryEntry = {
  weekStart: string
  wochenchef: string
  plan: WeekPlanEntry[]
  mealsData: Record<string, unknown>
  attendance: unknown
}

interface Props {
  currentUser: Chef
  wochenchef: Chef
  members: FamilyMember[]
  weekPlan: WeekPlanEntry[]
  shoppingDays: string[]
  shoppingPersons: Record<string, Chef>
  proposals: ChangeProposal[]
  onShoppingDaysChange: (days: string[]) => Promise<void>
  onShoppingPersonsChange: (persons: Record<string, Chef>) => Promise<void>
  onShoppingProposalSubmit: (proposal: ChangeProposal) => Promise<void>
  nextWeekData?: NextWeekData | null
  nextWeekStart?: string | null
  onWochenchefChange: (chef: Chef) => Promise<void>
  onNextWeekDataChange?: (data: Partial<NextWeekData>, nextMonday: string) => Promise<void>
  laeden: string[]
  onLaedenChange: (laeden: string[]) => Promise<void>
  canEditSettings: boolean
  memberStatuses?: { kuerzel: string; role: string; isLinked: boolean }[]
  defaultMealConfig?: Record<string, TagMahlzeitenKonfig>
  defaultPlanWE: boolean
  onDefaultMealConfigChange: (config: Record<string, TagMahlzeitenKonfig>, planWE: boolean, ernährungsVorgabe?: ErnährungsVorgabe) => Promise<void>
  ernährungsVorgabe?: ErnährungsVorgabe
  rezeptbuchEntries?: RezeptbuchEntry[]
  mealsData?: Record<string, Rezept>
  weekStart?: string | null
  attendance?: DayAttendance[]
  onRbSaveToBook?: (rezept: Rezept) => Promise<void>
  onRbUpdateRezept?: (id: string, rezept: Rezept) => Promise<void>
  onRbToggleFavorit?: (id: string, isFavorit: boolean) => Promise<void>
  onRbDeleteRezept?: (id: string) => Promise<void>
  onRbMarkGekocht?: (id: string) => void
  dishRatings?: DishRating[]
  onRbRateGericht?: (gerName: string, sterne: number, member?: Chef, rezept?: Rezept) => void
}

export default function MehrScreen({
  currentUser, wochenchef, members, weekPlan, shoppingDays, shoppingPersons, proposals,
  onShoppingDaysChange, onShoppingPersonsChange, onShoppingProposalSubmit,
  nextWeekData, nextWeekStart, onWochenchefChange, onNextWeekDataChange,
  laeden, onLaedenChange, canEditSettings,
  memberStatuses = [],
  defaultMealConfig, defaultPlanWE, onDefaultMealConfigChange,
  ernährungsVorgabe,
  rezeptbuchEntries = [],
  mealsData = {},
  weekStart = null,
  attendance = [],
  onRbSaveToBook,
  onRbUpdateRezept,
  onRbToggleFavorit,
  onRbDeleteRezept,
  onRbMarkGekocht,
  dishRatings,
  onRbRateGericht,
}: Props) {
  const [view, setView] = useState<View>('overview')
  const [saving, setSaving] = useState(false)
  const [stdDraft, setStdDraft] = useState<Record<string, TagMahlzeitenKonfig>>({})
  const [stdPlanWE, setStdPlanWE] = useState(false)
  const [stdSaving, setStdSaving] = useState(false)
  const [stdDirty, setStdDirty] = useState(false)
  const [stdSaved, setStdSaved] = useState(false)
  const [ernDraft, setErnDraft] = useState<ErnährungsVorgabe>({})
  const [ernDirty, setErnDirty] = useState(false)
  const [newLaden, setNewLaden] = useState('')
  const [laedenOpen, setLaedenOpen] = useState(false)
  const [changingCurrent, setChangingCurrent] = useState(false)
  const [changingNext, setChangingNext] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyLimit, setHistoryLimit] = useState(12)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [openWeek, setOpenWeek] = useState<string | null>(null)

  // ── Push-Benachrichtigungen ─────────────────────────────────────────────────
  const [pushSupported, setPushSupported] = useState<boolean | null>(null)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushSettings, setPushSettings] = useState({ reminder_vortag: true, reminder_kochtag: true, reminder_wochenchef: true })
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushSettingsSaving, setPushSettingsSaving] = useState(false)
  const [pushTestSending, setPushTestSending] = useState(false)
  const [pushTestMsg, setPushTestMsg] = useState<string | null>(null)
  const [pushTestReminderSending, setPushTestReminderSending] = useState<'vortag' | 'kochtag' | null>(null)
  const [testReminderMsg, setTestReminderMsg] = useState<string | null>(null)
  const [pushIsIos, setPushIsIos] = useState(false)
  const [pushIsStandalone, setPushIsStandalone] = useState(false)

  useEffect(() => {
    if (view !== 'push') return
    if (typeof window === 'undefined') return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = !!(window.navigator as { standalone?: boolean }).standalone ||
      window.matchMedia('(display-mode: standalone)').matches
    setPushIsIos(ios)
    setPushIsStandalone(standalone)

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setPushSupported(supported)
    if (!supported) return

    setPushPermission(Notification.permission)
    setPushError(null)

    // Browser-Abo prüfen und mit DB synchronisieren (idempotenter upsert).
    // Status = aktiv erst wenn BEIDES vorhanden ist (Browser + DB-Eintrag).
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (!reg) { setPushSubscribed(false); return }
        const browserSub = await reg.pushManager.getSubscription()
        if (!browserSub) { setPushSubscribed(false); return }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setPushSubscribed(false); return }

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ subscription: browserSub.toJSON() }),
        })

        if (res.ok) {
          setPushSubscribed(true)
        } else {
          const json = await res.json() as { error?: string }
          setPushSubscribed(false)
          setPushError(json.error ?? 'Verbindung zum Server fehlgeschlagen.')
        }
      } catch {
        setPushSubscribed(false)
      }
    })()

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch('/api/push/settings', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.ok ? r.json() : null)
        .then((json: { settings?: { reminder_vortag: boolean; reminder_kochtag: boolean; reminder_wochenchef: boolean } } | null) => {
          if (json?.settings) setPushSettings(json.settings)
        })
        .catch(() => {})
    })
  }, [view])

  async function handlePushSubscribe() {
    if (pushLoading) return
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      setPushError('Push-Konfiguration fehlt. Bitte Heiko bescheid geben (VAPID-Schlüssel nicht gesetzt).')
      return
    }
    setPushLoading(true)
    setPushError(null)
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        setPushError('Berechtigung nicht erteilt – bitte im Browser erlauben.')
        return
      }
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (!reg) throw new Error('Service Worker nicht gefunden. Bitte Seite neu laden.')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Nicht angemeldet.')
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error('Speichern fehlgeschlagen.')
      setPushSubscribed(true)
    } catch (e) {
      setPushError((e as Error).message || 'Fehler beim Einschalten.')
    } finally {
      setPushLoading(false)
    }
  }

  async function handlePushUnsubscribe() {
    if (pushLoading) return
    setPushLoading(true)
    setPushError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ endpoint }),
          })
        }
      }
      setPushSubscribed(false)
    } catch (e) {
      setPushError((e as Error).message || 'Fehler beim Ausschalten.')
    } finally {
      setPushLoading(false)
    }
  }

  async function handlePushTest() {
    if (pushTestSending) return
    setPushTestSending(true)
    setPushTestMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Nicht angemeldet.')
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json() as { ok?: boolean; error?: string; sent?: number }
      if (!res.ok) throw new Error(json.error || 'Fehler.')
      setPushTestMsg(`✓ Gesendet (${json.sent ?? 1} Gerät${(json.sent ?? 1) !== 1 ? 'e' : ''}) – in wenigen Sekunden ankommen.`)
    } catch (e) {
      setPushTestMsg('Fehler: ' + ((e as Error).message || 'Unbekannt'))
    } finally {
      setPushTestSending(false)
    }
  }

  async function handleTestReminder(type: 'vortag' | 'kochtag') {
    if (pushTestReminderSending) return
    setPushTestReminderSending(type)
    setTestReminderMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Nicht angemeldet.')
      const res = await fetch('/api/push/test-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ type }),
      })
      const json = await res.json() as { ok?: boolean; sent?: number; msg?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'Fehler.')
      if (json.msg) {
        setTestReminderMsg(json.msg)
      } else {
        const label = type === 'vortag' ? 'Vortags' : 'Kochtag'
        setTestReminderMsg(`✓ ${label}-Test gesendet (${json.sent ?? 1} Payload${(json.sent ?? 1) !== 1 ? 's' : ''})`)
      }
    } catch (e) {
      setTestReminderMsg('Fehler: ' + ((e as Error).message || 'Unbekannt'))
    } finally {
      setPushTestReminderSending(null)
    }
  }

  async function savePushSetting(key: keyof typeof pushSettings, value: boolean) {
    if (pushSettingsSaving) return
    const newSettings = { ...pushSettings, [key]: value }
    setPushSettings(newSettings)
    setPushSettingsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch('/api/push/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ settings: newSettings }),
      })
    } catch {}
    finally { setPushSettingsSaving(false) }
  }
  // ── Ende Push ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (view !== 'verlauf' || historyLoading || historyLoaded) return
    setHistoryLoading(true)
    setHistoryError(null)
    loadWeekHistory(historyLimit + 1).then(data => {
      if (data === null) {
        setHistoryError('Verlauf konnte nicht geladen werden. Bitte Seite neu laden oder Verbindung prüfen.')
      } else if (data.length > historyLimit) {
        setHistory(data.slice(0, historyLimit) as HistoryEntry[])
        setHasMoreHistory(true)
      } else {
        setHistory(data as HistoryEntry[])
        setHasMoreHistory(false)
      }
      setHistoryLoading(false)
      setHistoryLoaded(true)
    })
  }, [view, historyLoading, historyLoaded, historyLimit])

  useEffect(() => {
    if (view !== 'standardwoche') return
    const initial: Record<string, TagMahlzeitenKonfig> = {}
    for (const tag of WOCHENTAGE) {
      initial[tag] = defaultMealConfig?.[tag] ?? { mittag: 'normal', abend: 'normal' }
    }
    setStdDraft(initial)
    setStdPlanWE(defaultPlanWE)
    setStdDirty(false)
    setErnDraft(ernährungsVorgabe ?? {})
    setErnDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const isChef = currentUser === wochenchef
  const personNames = Object.fromEntries(members.map(m => [m.id, m.name])) as Record<Chef, string>
  const activeMembers = members.length ? members : DEFAULT_MEMBERS
  const CFG = buildMemberCfg(activeMembers)

  // Rémy Fairplay: person with fewest/oldest chef turns, excluding current chef and ineligible members
  const eligibleForSuggestion = memberStatuses.length > 0
    ? activeMembers.filter(m => { const s = memberStatuses.find(x => x.kuerzel === m.id); return !!(s?.isLinked && s.role !== 'parent') })
    : []
  const suggestedNextChef: Chef | null = eligibleForSuggestion.length > 0
    ? ([...eligibleForSuggestion].sort((a, b) => {
        const aCount = a.wochenchefStat?.count ?? 0
        const bCount = b.wochenchefStat?.count ?? 0
        if (aCount !== bCount) return aCount - bCount
        const aDate = a.wochenchefStat?.lastWeek ?? ''
        const bDate = b.wochenchefStat?.lastWeek ?? ''
        return aDate < bDate ? -1 : aDate > bDate ? 1 : 0
      }).find(m => m.id !== wochenchef)?.id ?? null)
    : null

  function cookingConflict(tag: string, person: Chef): boolean {
    return weekPlan.some(e => e.tag === tag && e.chef === person)
  }

  function toggleDay(tag: string) {
    const next = shoppingDays.includes(tag)
      ? shoppingDays.filter(d => d !== tag)
      : [...shoppingDays, tag]
    void onShoppingDaysChange(next)
  }

  function assignPerson(tag: string, person: Chef) {
    void onShoppingPersonsChange({ ...shoppingPersons, [tag]: person })
  }

  function proposeEinkaufPerson(tag: string, person: Chef) {
    void onShoppingProposalSubmit({
      id: crypto.randomUUID(),
      type: 'einkauf',
      tag,
      vonChef: currentUser,
      vorgeschlagene: person,
      createdAt: new Date().toISOString(),
    })
  }

  function hasPendingProposal(tag: string): boolean {
    return proposals.some(p => p.type === 'einkauf' && p.tag === tag && p.vonChef === currentUser)
  }

  async function changeWochenchef(chef: Chef) {
    if (saving || chef === wochenchef) return
    setSaving(true)
    try { await onWochenchefChange(chef) } finally { setSaving(false) }
  }

  async function changeNwWochenchef(chef: Chef) {
    if (saving || !onNextWeekDataChange) return
    setSaving(true)
    const nextMonday = nextWeekStart ?? getNextMondayIso()
    try { await onNextWeekDataChange({ wochenchef: chef }, nextMonday) } finally { setSaving(false) }
  }

  // ── Rezeptbuch ──────────────────────────────────────────────────────────────
  if (view === 'rezeptbuch' && onRbSaveToBook) {
    return (
      <RezeptbuchScreen
        entries={rezeptbuchEntries}
        currentUser={currentUser}
        canEditSettings={canEditSettings}
        members={members}
        mealsData={mealsData}
        weekPlan={weekPlan}
        weekStart={weekStart}
        attendance={attendance}
        onBack={() => setView('overview')}
        onSaveToBook={onRbSaveToBook}
        onUpdateRezept={onRbUpdateRezept ?? (async () => {})}
        onToggleFavorit={onRbToggleFavorit ?? (async () => {})}
        onDeleteRezept={onRbDeleteRezept ?? (async () => {})}
        onMarkGekocht={onRbMarkGekocht ?? (() => {})}
        dishRatings={dishRatings}
        onRateGericht={onRbRateGericht}
      />
    )
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  if (view === 'overview') {
    const nwChef = nextWeekData?.wochenchef ?? null
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar"><h1>⋯ Mehr</h1></div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          <button
            onClick={() => setView('einkauf')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 20, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>🛒</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Einkaufsmanager</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {shoppingDays.length > 0
                  ? `${shoppingDays.length} Einkaufstag${shoppingDays.length > 1 ? 'e' : ''} diese Woche`
                  : 'Einkaufstage und -personen festlegen'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('wochenchef')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>👨‍🍳</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Wochenchefs</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Diese Woche:{' '}
                <span style={{ color: CFG[wochenchef]?.c ?? '#333', fontWeight: 600 }}>
                  {personNames[wochenchef] ?? wochenchef}
                </span>
                {memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === wochenchef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}> (kein Konto)</span>
                )}
                {nwChef && (
                  <> · Nächste:{' '}
                    <span style={{ color: CFG[nwChef]?.c ?? '#333', fontWeight: 600 }}>
                      {personNames[nwChef] ?? nwChef}
                    </span>
                    {memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === nwChef)?.isLinked !== true && (
                      <span style={{ fontSize: 10, color: '#92400E' }}> (kein Konto)</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('rezeptbuch')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>📖</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Rezepte</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {rezeptbuchEntries.length > 0
                  ? `${rezeptbuchEntries.length} Rezept${rezeptbuchEntries.length === 1 ? '' : 'e'} gespeichert`
                  : 'Lieblingsrezepte & Kochverlauf'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('standardwoche')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>📋</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Standardwoche</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {defaultMealConfig
                  ? `Mo–Fr Mittag ${defaultMealConfig['Montag']?.mittag ?? 'normal'} · Sa/So ${defaultPlanWE ? 'ein' : 'aus'}`
                  : 'Grundeinstellung für neue Wochen'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

          <button
            onClick={() => setView('push')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', marginTop: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 26 }}>🔔</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Benachrichtigungen</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Push-Nachrichten ein/ausschalten
              </div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 18 }}>›</span>
          </button>

        </div>
        {(process.env.NEXT_PUBLIC_BUILD_DATE || process.env.NEXT_PUBLIC_BUILD_COMMIT) && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#888', padding: '10px 0 4px' }}>
            <span style={{ background: '#F3F4F6', borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
              {[process.env.NEXT_PUBLIC_BUILD_COMMIT, process.env.NEXT_PUBLIC_BUILD_DATE].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Standardwoche ───────────────────────────────────────────────────────────
  if (view === 'standardwoche') {
    function setMittag(tag: string, val: MittagTyp) {
      setStdDraft(d => ({ ...d, [tag]: { ...d[tag], mittag: val } }))
      setStdDirty(true)
    }
    function setAbend(tag: string, val: AbendTyp) {
      setStdDraft(d => ({ ...d, [tag]: { ...d[tag], abend: val } }))
      setStdDirty(true)
    }
    async function handleStdSave() {
      if (stdSaving) return
      setStdSaving(true)
      try {
        await onDefaultMealConfigChange(stdDraft, stdPlanWE, ernDirty ? ernDraft : undefined)
        setStdDirty(false)
        setErnDirty(false)
        setStdSaved(true)
        setTimeout(() => setStdSaved(false), 2500)
      }
      finally { setStdSaving(false) }
    }
    const showTage = WOCHENTAGE.filter(t => stdPlanWE || !['Samstag', 'Sonntag'].includes(t))
    const readOnly = !canEditSettings
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>📋 Standardwoche</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>
          {readOnly && (
            <div style={{ fontSize: 12, color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 12px', marginTop: 14, marginBottom: 4 }}>
              ℹ️ Ansicht – Ändern können nur Organisator und Eltern.
            </div>
          )}
          <div style={{ pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.75 : 1 }}>
          <div style={{ fontSize: 12, color: '#666', marginTop: 16, marginBottom: 14 }}>
            Vorgabe für neue Wochen. Die Anwesenheit wird daraus vorausgefüllt.
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Sa/So planen</span>
              <button
                onClick={() => { setStdPlanWE(v => !v); setStdDirty(true) }}
                style={{
                  padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: stdPlanWE ? '#0F6E56' : '#F3F4F6',
                  color: stdPlanWE ? '#fff' : '#444',
                }}
              >
                {stdPlanWE ? 'Ja' : 'Nein'}
              </button>
            </div>
          </div>

          {showTage.map(tag => {
            const konfig: TagMahlzeitenKonfig = stdDraft[tag] ?? { mittag: 'normal', abend: 'normal' }
            return (
              <div key={tag} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 10 }}>{TAG_SHORT[tag]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#888', width: 46, flexShrink: 0 }}>Mittag</span>
                    {(['kein', 'leicht', 'normal'] as const).map(val => (
                      <button key={val} onClick={() => setMittag(tag, val)} style={{
                        padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: konfig.mittag === val ? 700 : 400,
                        background: konfig.mittag === val ? '#0F6E56' : '#F3F4F6',
                        color: konfig.mittag === val ? '#fff' : '#444',
                      }}>{val}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#888', width: 46, flexShrink: 0 }}>Abend</span>
                    {(['leicht', 'normal'] as const).map(val => (
                      <button key={val} onClick={() => setAbend(tag, val)} style={{
                        padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: konfig.abend === val ? 700 : 400,
                        background: konfig.abend === val ? '#0F6E56' : '#F3F4F6',
                        color: konfig.abend === val ? '#fff' : '#444',
                      }}>{val}</button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {/* ── 🌿 Ernährung ──────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '14px 16px', marginTop: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 10 }}>🌿 Ernährung</div>

            {/* Grundhaltung */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Grundhaltung</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['alles', 'vegetarisch', 'vegan'] as const).map(v => (
                  <button key={v} onClick={() => { setErnDraft(d => ({ ...d, grundhaltung: v })); setErnDirty(true) }}
                    style={{ padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                      fontWeight: (ernDraft.grundhaltung ?? 'alles') === v ? 700 : 400,
                      background: (ernDraft.grundhaltung ?? 'alles') === v ? '#0F6E56' : '#F3F4F6',
                      color: (ernDraft.grundhaltung ?? 'alles') === v ? '#fff' : '#444' }}>
                    {v === 'alles' ? 'Alles' : v === 'vegetarisch' ? 'Vegetarisch' : 'Vegan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Vegetarische Tage – nur wenn nicht vegan/vegetarisch */}
            {ernDraft.grundhaltung !== 'vegan' && ernDraft.grundhaltung !== 'vegetarisch' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Vegetarische Tage</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {WOCHENTAGE.slice(0, stdPlanWE ? 7 : 5).map(t => {
                    const on = ernDraft.vegetarischeTage?.includes(t) ?? false
                    return (
                      <button key={t} onClick={() => { setErnDraft(d => ({ ...d, vegetarischeTage: on ? (d.vegetarischeTage ?? []).filter(x => x !== t) : [...(d.vegetarischeTage ?? []), t] })); setErnDirty(true) }}
                        style={{ padding: '4px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
                          fontWeight: on ? 700 : 400, background: on ? '#0F6E56' : '#F3F4F6', color: on ? '#fff' : '#444' }}>
                        {TAG_SHORT[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Fleisch max – nur wenn nicht vegan/vegetarisch */}
            {ernDraft.grundhaltung !== 'vegan' && ernDraft.grundhaltung !== 'vegetarisch' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Fleisch höchstens pro Woche</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => { setErnDraft(d => ({ ...d, fleischMaxProWoche: Math.max(0, (d.fleischMaxProWoche ?? 7) - 1) })); setErnDirty(true) }}
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 30, textAlign: 'center' }}>
                    {ernDraft.fleischMaxProWoche == null ? 'kein Limit' : `${ernDraft.fleischMaxProWoche}×`}
                  </span>
                  <button onClick={() => { setErnDraft(d => ({ ...d, fleischMaxProWoche: d.fleischMaxProWoche == null ? 7 : Math.min(14, d.fleischMaxProWoche + 1) })); setErnDirty(true) }}
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  {ernDraft.fleischMaxProWoche != null && (
                    <button onClick={() => { setErnDraft(d => { const { fleischMaxProWoche: _, ...rest } = d; return rest }); setErnDirty(true) }}
                      style={{ fontSize: 10, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                  )}
                </div>
              </div>
            )}

            {/* Fisch – nur wenn nicht vegan */}
            {ernDraft.grundhaltung !== 'vegan' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Fisch pro Woche</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(['mindestens', 'etwa'] as const).map(m => (
                    <button key={m} onClick={() => { setErnDraft(d => ({ ...d, fischModus: m })); setErnDirty(true) }}
                      style={{ padding: '4px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
                        fontWeight: (ernDraft.fischModus ?? 'mindestens') === m ? 700 : 400,
                        background: (ernDraft.fischModus ?? 'mindestens') === m ? '#0F6E56' : '#F3F4F6',
                        color: (ernDraft.fischModus ?? 'mindestens') === m ? '#fff' : '#444' }}>
                      {m === 'mindestens' ? 'mind.' : 'etwa'}
                    </button>
                  ))}
                  <button onClick={() => { setErnDraft(d => ({ ...d, fischMinProWoche: Math.max(0, (d.fischMinProWoche ?? 0) - 1) })); setErnDirty(true) }}
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{ernDraft.fischMinProWoche ?? 0}×</span>
                  <button onClick={() => { setErnDraft(d => ({ ...d, fischMinProWoche: Math.min(7, (d.fischMinProWoche ?? 0) + 1) })); setErnDirty(true) }}
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>
            )}

            {/* Saisonal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#444' }}>Saisonale Zutaten bevorzugen</span>
              <button onClick={() => { setErnDraft(d => ({ ...d, saisonalBevorzugen: !d.saisonalBevorzugen })); setErnDirty(true) }}
                style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: ernDraft.saisonalBevorzugen ? '#0F6E56' : '#F3F4F6',
                  color: ernDraft.saisonalBevorzugen ? '#fff' : '#444' }}>
                {ernDraft.saisonalBevorzugen ? 'Ja' : 'Nein'}
              </button>
            </div>
          </div>

          </div>{/* end pointer-events wrapper */}
          {!readOnly && (
            <>
              <button
                onClick={() => void handleStdSave()}
                disabled={stdSaving || (!stdDirty && !ernDirty)}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  cursor: stdSaving || (!stdDirty && !ernDirty) ? 'default' : 'pointer',
                  fontSize: 15, fontWeight: 700, marginTop: 8,
                  background: stdSaving || (!stdDirty && !ernDirty) ? '#E5E7EB' : '#0F6E56',
                  color: stdSaving || (!stdDirty && !ernDirty) ? '#999' : '#fff',
                }}
              >
                {stdSaving ? 'Speichere…' : 'Standard speichern'}
              </button>
              {stdSaved && (
                <div style={{ textAlign: 'center', color: '#0F6E56', fontWeight: 700, fontSize: 14, marginTop: 10 }}>
                  ✓ Gespeichert
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Einkaufsmanager ─────────────────────────────────────────────────────────
  if (view === 'einkauf') {
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>🛒 Einkaufsmanager</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          {isChef ? (
            <>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 14, marginTop: 16 }}>
                An welchen Tagen wird diese Woche eingekauft? (Mehrfachauswahl)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {WOCHENTAGE.map(tag => {
                  const active = shoppingDays.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleDay(tag)}
                      style={{
                        padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: active ? 700 : 400,
                        background: active ? '#0F6E56' : '#F3F4F6',
                        color: active ? '#fff' : '#444',
                        transition: 'background 0.15s',
                      }}
                    >
                      {TAG_SHORT[tag]}
                    </button>
                  )
                })}
              </div>

              {shoppingDays.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {shoppingDays.map(tag => {
                    const assigned = shoppingPersons[tag]
                    const missing = !assigned
                    return (
                      <div key={tag} style={{ marginBottom: 12, background: '#F9FAFB', borderRadius: 10, padding: '10px 12px', border: `1px solid ${missing ? '#FCA5A5' : '#e5e7eb'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: missing ? '#DC2626' : '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                          🛒 {tag} — wer kauft ein?
                          {missing && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>*</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {activeMembers.map(m => {
                            const isSelected = assigned === m.id
                            const cc = CFG[m.id] ?? Object.values(CFG)[0]
                            const conflict = isSelected && cookingConflict(tag, m.id as Chef)
                            return (
                              <button
                                key={m.id}
                                onClick={() => assignPerson(tag, m.id as Chef)}
                                style={{
                                  flex: 1, padding: '7px 4px', borderRadius: 8, textAlign: 'center',
                                  cursor: 'pointer', border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                                  background: isSelected ? cc.bg : 'white',
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>
                                  {m.name}
                                </div>
                                {isSelected && !conflict && <div style={{ fontSize: 9, color: cc.c, marginTop: 2 }}>✓</div>}
                                {conflict && <div style={{ fontSize: 9, color: '#DC2626', marginTop: 2 }}>⚠ kocht auch</div>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 16 }}>
              {shoppingDays.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                    Einkaufstage diese Woche — du kannst eine Person vorschlagen:
                  </div>
                  {shoppingDays.map(tag => {
                    const assigned = shoppingPersons[tag]
                    const pending = proposals.find(p => p.type === 'einkauf' && p.tag === tag && p.vonChef === currentUser)
                    return (
                      <div key={tag} style={{ marginBottom: 12, background: '#F9FAFB', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>🛒 {tag}</span>
                          {assigned ? (
                            <span style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>
                              {personNames[assigned]}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#bbb' }}>noch offen</span>
                          )}
                        </div>
                        {pending ? (
                          <div style={{ fontSize: 11, color: '#92400E', background: '#FFFBEB', borderRadius: 6, padding: '5px 8px' }}>
                            ⏳ Dein Vorschlag: {personNames[pending.vorgeschlagene!]} — wartet auf Wochenchef
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Vorschlagen:</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {activeMembers.map(m => {
                                const isAssigned = assigned === m.id
                                const cc = CFG[m.id] ?? Object.values(CFG)[0]
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => !hasPendingProposal(tag) && proposeEinkaufPerson(tag, m.id as Chef)}
                                    disabled={isAssigned}
                                    style={{
                                      flex: 1, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                                      cursor: isAssigned ? 'default' : 'pointer',
                                      border: `1px solid ${isAssigned ? cc.c : '#e5e7eb'}`,
                                      background: isAssigned ? cc.bg : 'white',
                                      opacity: isAssigned ? 0.7 : 1,
                                    }}
                                  >
                                    <div style={{ fontSize: 11, fontWeight: 600, color: isAssigned ? cc.c : '#333' }}>
                                      {m.name}
                                    </div>
                                    {isAssigned && <div style={{ fontSize: 9, color: cc.c }}>✓ aktuell</div>}
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#444', background: '#F9FAFB', borderRadius: 12, padding: '14px 16px' }}>
                  <span style={{ color: '#aaa' }}>Noch keine Einkaufstage festgelegt.</span>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>Nur der Wochenchef kann das ändern.</div>
                </div>
              )}
            </div>
          )}

          {/* Einkaufsläden */}
          <div className="card" style={{ marginTop: 24 }}>
            <button
              onClick={() => setLaedenOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>Einkaufsläden ({laeden.length})</span>
              <span style={{ fontSize: 16, color: '#bbb', lineHeight: 1 }}>{laedenOpen ? '▲' : '▼'}</span>
            </button>
            {laedenOpen && (
              <div style={{ marginTop: 12 }}>
                {laeden.map((l, i) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < laeden.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#111' }}>{l}</span>
                    {canEditSettings && (
                      <button onClick={() => void onLaedenChange(laeden.filter(x => x !== l))} style={{ border: 'none', background: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
                {canEditSettings && (
                  <div style={{ display: 'flex', gap: 8, marginTop: laeden.length > 0 ? 10 : 0 }}>
                    <input
                      value={newLaden}
                      onChange={e => setNewLaden(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newLaden.trim() && !laeden.includes(newLaden.trim())) {
                          void onLaedenChange([...laeden, newLaden.trim()])
                          setNewLaden('')
                        }
                      }}
                      placeholder="Laden hinzufügen"
                      style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        if (newLaden.trim() && !laeden.includes(newLaden.trim())) {
                          void onLaedenChange([...laeden, newLaden.trim()])
                          setNewLaden('')
                        }
                      }}
                      style={{ border: 'none', background: '#1D9E75', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                    >+</button>
                  </div>
                )}
                {!canEditSettings && laeden.length === 0 && (
                  <div style={{ fontSize: 12, color: '#bbb', paddingTop: 4 }}>Keine Läden eingetragen.</div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    )
  }

  // ── Wochenchefs ─────────────────────────────────────────────────────────────
  if (view === 'wochenchef') {
    const nwChef = nextWeekData?.wochenchef ?? null
    const ccCurrent = CFG[wochenchef] ?? Object.values(CFG)[0]

    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>👨‍🍳 Wochenchefs</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          {/* Aktuelle Woche */}
          <div style={{ marginTop: 20 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Aktuelle Woche</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                {members.some(m => m.id === wochenchef)
                  ? <span style={{ fontSize: 15, fontWeight: 700, color: ccCurrent.c }}>{personNames[wochenchef] || wochenchef}</span>
                  : <span style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A' }}>⚠️ {wochenchef || 'nicht gesetzt'}</span>
                }
                {currentUser === wochenchef && (
                  <span style={{ fontSize: 10, color: '#1D9E75', background: '#E1F5EE', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>du</span>
                )}
                {memberStatuses.length > 0 && members.some(m => m.id === wochenchef) && memberStatuses.find(s => s.kuerzel === wochenchef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}>(noch kein Konto)</span>
                )}
                {canEditSettings && !isChef && members.some(m => m.id === wochenchef) && (
                  <button
                    onClick={() => setChangingCurrent(c => !c)}
                    style={{ marginLeft: 'auto', fontSize: 11, color: changingCurrent ? '#1D9E75' : '#888', background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    {changingCurrent ? '× Abbrechen' : '✏️ Ändern'}
                  </button>
                )}
              </div>

              {(isChef || changingCurrent || (canEditSettings && !members.some(m => m.id === wochenchef))) ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef {isChef || changingCurrent ? 'ändern' : 'festlegen'}:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = wochenchef === m.id
                      const cc = CFG[m.id] ?? Object.values(CFG)[0]
                      const hasAccount = memberStatuses.length === 0 || memberStatuses.find(s => s.kuerzel === m.id)?.isLinked === true
                      return (
                        <button
                          key={m.id}
                          onClick={() => void changeWochenchef(m.id as Chef)}
                          disabled={saving}
                          style={{
                            flex: 1, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
                            cursor: saving ? 'default' : 'pointer',
                            border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                            background: isSelected ? cc.bg : 'white',
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>{m.name}</div>
                          {!hasAccount && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>noch kein Konto</div>}
                          {isSelected && <div style={{ fontSize: 10, color: cc.c, marginTop: 2 }}>✓</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  Ändern können Organisator und Eltern.
                </div>
              )}
            </div>
          </div>

          {/* Fairplay */}
          <div style={{ marginTop: 24 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Fairplay</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              {activeMembers.map((m, i) => {
                const status = memberStatuses.find(s => s.kuerzel === m.id)
                const isEligible = status?.isLinked === true && status.role !== 'parent'
                const cc = CFG[m.id] ?? Object.values(CFG)[0]
                const wcCount = m.wochenchefStat?.count ?? 0
                const chefCount = m.chefStat?.count ?? 0
                const lastWcKW = m.wochenchefStat?.lastWeek ? `KW ${getKW(m.wochenchefStat.lastWeek)}` : '–'
                return (
                  <div key={m.id} style={{ padding: '8px 0', borderBottom: i < activeMembers.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cc.c }}>{m.name}</span>
                      {memberStatuses.length > 0 && !isEligible && (
                        <span style={{ fontSize: 9, color: '#aaa', background: '#f5f5f5', borderRadius: 8, padding: '1px 5px' }}>
                          {status?.isLinked !== true ? 'kein Konto' : 'kein Auto-Vorschlag'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {wcCount}× Wochenchef · {chefCount}× gekocht · zuletzt Wochenchef: {lastWcKW}
                    </div>
                  </div>
                )
              })}
              {suggestedNextChef && (
                <div style={{ fontSize: 11, color: '#555', background: '#F0FAF5', border: '1px solid #B2DFCC', borderRadius: 8, padding: '7px 10px', marginTop: 12 }}>
                  🐀 Rémy empfiehlt <strong style={{ color: CFG[suggestedNextChef]?.c ?? '#333' }}>{personNames[suggestedNextChef] ?? suggestedNextChef}</strong> als nächsten Wochenchef, weil er/sie am seltensten Wochenchef war. Berücksichtigt werden nur Personen mit eigenem Konto, Oma, Opa &amp; Co. ausgenommen.
                </div>
              )}
              {!suggestedNextChef && memberStatuses.length > 0 && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Kein automatischer Vorschlag möglich (keine berechtigten Personen).</div>
              )}
            </div>
          </div>

          {/* Nächste Woche */}
          <div style={{ marginTop: 24 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>Nächste Woche</div>
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#666' }}>Wochenchef:</span>
                {nwChef ? (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 700, color: CFG[nwChef]?.c ?? '#333' }}>
                      {personNames[nwChef] ?? nwChef}
                    </span>
                    {nextWeekData?.wochenchefAutoAssigned && (
                      <span style={{ fontSize: 10, color: '#6B7280' }}>(von Rémy festgelegt)</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: '#bbb' }}>noch nicht festgelegt</span>
                )}
                {nwChef && memberStatuses.length > 0 && memberStatuses.find(s => s.kuerzel === nwChef)?.isLinked !== true && (
                  <span style={{ fontSize: 10, color: '#92400E' }}>(noch kein Konto)</span>
                )}
                {canEditSettings && !isChef && (
                  <button
                    onClick={() => setChangingNext(n => !n)}
                    style={{ marginLeft: 'auto', fontSize: 11, color: changingNext ? '#1D9E75' : '#888', background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    {changingNext ? '× Abbrechen' : '✏️ Ändern'}
                  </button>
                )}
              </div>

              {/* Rémy Fairplay-Empfehlung – nur anzeigen wenn noch kein NW-Chef gesetzt */}
              {suggestedNextChef && !nwChef && (
                <div style={{
                  fontSize: 11, color: '#555', background: '#F0FAF5',
                  border: '1px solid #B2DFCC', borderRadius: 8, padding: '7px 10px', marginTop: 10,
                }}>
                  🐀 Rémy empfiehlt:{' '}
                  <strong style={{ color: CFG[suggestedNextChef]?.c ?? '#333' }}>
                    {personNames[suggestedNextChef] ?? suggestedNextChef}
                  </strong>
                  {' '}(war am seltensten Wochenchef)
                </div>
              )}

              {(isChef || changingNext) ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Wochenchef {nwChef ? 'ändern' : 'festlegen'}:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeMembers.map(m => {
                      const isSelected = nwChef === m.id
                      const cc = CFG[m.id] ?? Object.values(CFG)[0]
                      const hasAccount = memberStatuses.length === 0 || memberStatuses.find(s => s.kuerzel === m.id)?.isLinked === true
                      return (
                        <button
                          key={m.id}
                          onClick={() => void changeNwWochenchef(m.id as Chef)}
                          disabled={saving}
                          style={{
                            flex: 1, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
                            cursor: saving ? 'default' : 'pointer',
                            border: `2px solid ${isSelected ? cc.c : '#e5e7eb'}`,
                            background: isSelected ? cc.bg : 'white',
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? cc.c : '#333' }}>{m.name}</div>
                          {!hasAccount && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>noch kein Konto</div>}
                          {isSelected && <div style={{ fontSize: 10, color: cc.c, marginTop: 2 }}>✓</div>}
                          {m.id === suggestedNextChef && !isSelected && (
                            <div style={{ fontSize: 9, color: '#1D9E75', marginTop: 2 }}>🐀 Tipp</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  Ändern können Organisator und Eltern.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    )
  }

  // ── Verlauf ─────────────────────────────────────────────────────────────────
  if (view === 'verlauf') {
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>📅 Verlauf</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>
          {historyLoading && (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, marginTop: 32 }}>Lade Verlauf…</div>
          )}
          {!historyLoading && historyError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginTop: 20, fontSize: 12, color: '#991B1B' }}>
              ⚠️ {historyError}
            </div>
          )}
          {!historyLoading && !historyError && historyLoaded && history.length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, marginTop: 32, lineHeight: 1.6 }}>
              Noch keine vergangenen Wochen im Archiv.<br />
              <span style={{ fontSize: 12 }}>Die erste Woche wird beim nächsten Wochenwechsel gespeichert.</span>
            </div>
          )}
          {!historyLoading && !historyError && history.map(week => {
            const kw = getKW(week.weekStart)
            const mondayDate = new Date(week.weekStart + 'T00:00:00')
            const sundayDate = new Date(mondayDate)
            sundayDate.setDate(mondayDate.getDate() + 6)
            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
            const dateRange = `${fmt(mondayDate)}–${fmt(sundayDate)}${sundayDate.getFullYear()}`
            const isOpen = openWeek === week.weekStart
            const days = WOCHENTAGE.filter(tag => week.plan.some(e => e.tag === tag))
            return (
              <div key={week.weekStart} style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginTop: 14 }}>
                <button
                  onClick={() => setOpenWeek(isOpen ? null : week.weekStart)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>KW {kw}</span>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{dateRange}</span>
                    {week.wochenchef && (
                      <span style={{ fontSize: 12, color: CFG[week.wochenchef as Chef]?.c ?? '#555', marginLeft: 8, fontWeight: 600 }}>
                        · {personNames[week.wochenchef as Chef] ?? week.wochenchef}
                      </span>
                    )}
                  </div>
                  <span style={{ color: '#bbb', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0f0f0' }}>
                    {days.map(tag => {
                      const mittag = week.plan.find(e => e.tag === tag && e.slot === 'Mittag')
                      const abend = week.plan.find(e => e.tag === tag && e.slot === 'Abend')
                      return (
                        <div key={tag} style={{ borderTop: '1px solid #f5f5f5', padding: '8px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>
                            {TAG_SHORT[tag] ?? tag}
                          </div>
                          {mittag && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: '#aaa', width: 22 }}>☀️</span>
                              <span style={{ fontSize: 13 }}>{mittag.emoji}</span>
                              <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{mittag.gericht}</span>
                              {mittag.chef && <span style={{ fontSize: 11, color: CFG[mittag.chef as Chef]?.c ?? '#aaa' }}>{personNames[mittag.chef as Chef] ?? mittag.chef}</span>}
                            </div>
                          )}
                          {abend && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#aaa', width: 22 }}>🌙</span>
                              <span style={{ fontSize: 13 }}>{abend.emoji}</span>
                              <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{abend.gericht}</span>
                              {abend.chef && <span style={{ fontSize: 11, color: CFG[abend.chef as Chef]?.c ?? '#aaa' }}>{personNames[abend.chef as Chef] ?? abend.chef}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {!historyLoading && hasMoreHistory && (
            <button
              onClick={() => { setHistoryLimit(l => l + 12); setHistoryLoaded(false) }}
              style={{ display: 'block', width: '100%', marginTop: 14, padding: '10px', border: '1px solid #E5E7EB', borderRadius: 10, background: 'white', fontSize: 13, color: '#555', cursor: 'pointer' }}
            >
              Mehr laden…
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Push-Benachrichtigungen ─────────────────────────────────────────────────
  if (view === 'push') {
    const isOwner = memberStatuses.find(s => s.kuerzel === currentUser)?.role === 'owner'
    return (
      <div className="screen active" style={{ overflowY: 'auto' }}>
        <div className="topbar">
          <button className="back" onClick={() => setView('overview')}>‹</button>
          <h1>🔔 Benachrichtigungen</h1>
        </div>
        <div className="content" style={{ padding: '0 16px 24px' }}>

          {/* Browser unterstützt kein Push */}
          {pushSupported === false && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginTop: 20, fontSize: 13, color: '#555' }}>
              Dein Browser unterstützt keine Push-Nachrichten. Bitte Chrome, Edge oder Firefox verwenden.
            </div>
          )}

          {/* iOS aber nicht als Home-Screen-App */}
          {pushSupported !== false && pushIsIos && !pushIsStandalone && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 16px', marginTop: 20, fontSize: 13, color: '#92400E' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Homescreen-App nötig</div>
              Damit Push-Nachrichten auf deinem iPhone/iPad ankommen, muss MenuFamPlan als App auf dem Homescreen installiert sein:
              <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Im Safari-Browser öffnen</li>
                <li>Teilen-Symbol tippen (□↑)</li>
                <li>„Zum Home-Bildschirm" wählen</li>
                <li>Danach diese Seite in der App öffnen</li>
              </ol>
            </div>
          )}

          {/* Permission denied */}
          {pushSupported !== false && pushPermission === 'denied' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 16px', marginTop: 20, fontSize: 13, color: '#991B1B' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Push ist blockiert</div>
              Bitte in den Browser-Einstellungen die Berechtigung für diese Seite zurücksetzen, danach neu laden.
            </div>
          )}

          {/* Einschalten-Button */}
          {pushSupported === true && pushPermission !== 'denied' && !pushSubscribed && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => void handlePushSubscribe()}
                disabled={pushLoading || (pushIsIos && !pushIsStandalone)}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  cursor: pushLoading || (pushIsIos && !pushIsStandalone) ? 'default' : 'pointer',
                  fontSize: 15, fontWeight: 700,
                  background: pushLoading || (pushIsIos && !pushIsStandalone) ? '#E5E7EB' : '#0F6E56',
                  color: pushLoading || (pushIsIos && !pushIsStandalone) ? '#999' : '#fff',
                }}
              >
                {pushLoading ? 'Wird aktiviert…' : '🔔 Push-Nachrichten einschalten'}
              </button>
            </div>
          )}

          {/* Aktiv-Status + Einstellungen */}
          {pushSupported === true && pushSubscribed && (
            <>
              <div style={{ background: '#F0FAF5', border: '1px solid #B2DFCC', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: '#065F46', fontWeight: 600 }}>
                ✓ Push auf diesem Gerät aktiv
              </div>

              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '14px 16px', marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
                  Welche Nachrichten?
                </div>
                {[
                  { key: 'reminder_vortag' as const, label: 'Vortags-Erinnerung', desc: 'Morgen kochst du: … (ca. 14–15 Uhr)' },
                  { key: 'reminder_kochtag' as const, label: 'Kochtag-Erinnerung', desc: 'Heute kochst du: … (ca. 7–8 Uhr)' },
                  { key: 'reminder_wochenchef' as const, label: 'Wochenchef-Erinnerung', desc: 'Wenn nächste Woche noch nicht geplant (Sa/So)' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: item.key !== 'reminder_wochenchef' ? '1px solid #f5f5f5' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <button
                      onClick={() => void savePushSetting(item.key, !pushSettings[item.key])}
                      disabled={pushSettingsSaving}
                      style={{
                        padding: '6px 16px', borderRadius: 20, border: 'none',
                        cursor: pushSettingsSaving ? 'default' : 'pointer',
                        fontSize: 13, fontWeight: 600, flexShrink: 0, marginLeft: 12,
                        background: pushSettings[item.key] ? '#0F6E56' : '#F3F4F6',
                        color: pushSettings[item.key] ? '#fff' : '#444',
                      }}
                    >
                      {pushSettings[item.key] ? 'An' : 'Aus'}
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => void handlePushTest()}
                disabled={pushTestSending}
                style={{
                  width: '100%', padding: '12px', borderRadius: 14, border: '1px solid #E5E7EB',
                  cursor: pushTestSending ? 'default' : 'pointer',
                  fontSize: 14, fontWeight: 600, marginTop: 14,
                  background: pushTestSending ? '#F9FAFB' : '#fff',
                  color: pushTestSending ? '#aaa' : '#0F6E56',
                }}
              >
                {pushTestSending ? 'Wird gesendet…' : '📨 Test-Nachricht senden'}
              </button>
              {pushTestMsg && (
                <div style={{ fontSize: 12, color: pushTestMsg.startsWith('Fehler') ? '#991B1B' : '#065F46', marginTop: 8, textAlign: 'center' }}>
                  {pushTestMsg}
                </div>
              )}

              {isOwner && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Erinnerungen testen (nur du siehst diese):</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['vortag', 'kochtag'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => void handleTestReminder(type)}
                        disabled={pushTestReminderSending !== null}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 12, border: '1px solid #E5E7EB',
                          cursor: pushTestReminderSending !== null ? 'default' : 'pointer',
                          fontSize: 12, fontWeight: 600,
                          background: pushTestReminderSending === type ? '#F9FAFB' : '#fff',
                          color: pushTestReminderSending === type ? '#aaa' : '#0F6E56',
                        }}
                      >
                        {pushTestReminderSending === type
                          ? 'Wird gesendet…'
                          : type === 'vortag' ? '📅 Vortags-Erinnerung' : '☀️ Kochtag-Erinnerung'}
                      </button>
                    ))}
                  </div>
                  {testReminderMsg && (
                    <div style={{ fontSize: 12, color: testReminderMsg.startsWith('Fehler') ? '#991B1B' : '#065F46', marginTop: 8, textAlign: 'center' }}>
                      {testReminderMsg}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => void handlePushUnsubscribe()}
                disabled={pushLoading}
                style={{ display: 'block', margin: '20px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#aaa', textDecoration: 'underline' }}
              >
                Push auf diesem Gerät deaktivieren
              </button>
            </>
          )}

          {pushError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#991B1B' }}>
              <div>{pushError}</div>
              {!pushSubscribed && (
                <button
                  onClick={() => { setPushError(null); void handlePushSubscribe() }}
                  style={{ marginTop: 8, background: 'none', border: '1px solid #FECACA', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#991B1B' }}
                >
                  Nochmal versuchen
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    )
  }

  return null
}
