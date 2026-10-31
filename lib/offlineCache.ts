import type { ShoppingItem, WeekPlanEntry, Rezept, FamilyProfile } from './state'

const KEY_IDENTITY = 'fp_identity'
const KEY_CACHE    = 'fp_offline_cache'
const KEY_PENDING  = 'fp_pending_shopping'
const KEY_DELETED  = 'fp_deleted_shopping_ids'

export interface OfflineIdentity {
  familyId: string
  kuerzel: string
}

export interface OfflineDataCache {
  shoppingList: ShoppingItem[]
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  familyProfile: FamilyProfile | null
  savedAt: string   // ISO timestamp
}

// ── Pending ops (recorded while offline) ─────────────────────────────────────
export type PendingOp =
  | { type: 'update'; item: ShoppingItem }
  | { type: 'delete'; id: string; deletedAt: string }

export function loadPendingOps(): PendingOp[] {
  try { const r = localStorage.getItem(KEY_PENDING); return r ? JSON.parse(r) as PendingOp[] : [] }
  catch { return [] }
}
export function savePendingOps(ops: PendingOp[]): void {
  try { localStorage.setItem(KEY_PENDING, JSON.stringify(ops)) } catch {}
}
export function appendPendingOps(ops: PendingOp[]): void {
  if (!ops.length) return
  savePendingOps([...loadPendingOps(), ...ops])
}
export function clearPendingOps(): void {
  try { localStorage.removeItem(KEY_PENDING) } catch {}
}

// ── Deleted item IDs (tracked so merge doesn't re-add remote items we deleted) ─
export function loadDeletedIds(): string[] {
  try { const r = localStorage.getItem(KEY_DELETED); return r ? JSON.parse(r) as string[] : [] }
  catch { return [] }
}
export function addDeletedIds(ids: string[]): void {
  if (!ids.length) return
  try {
    const existing = loadDeletedIds()
    localStorage.setItem(KEY_DELETED, JSON.stringify([...new Set([...existing, ...ids])]))
  } catch {}
}
export function clearDeletedIds(): void {
  try { localStorage.removeItem(KEY_DELETED) } catch {}
}

// ── Identity cache (family_id + kuerzel from last successful auth) ─────────────
export function saveIdentity(id: OfflineIdentity): void {
  try { localStorage.setItem(KEY_IDENTITY, JSON.stringify(id)) } catch {}
}
export function loadIdentity(): OfflineIdentity | null {
  try { const r = localStorage.getItem(KEY_IDENTITY); return r ? JSON.parse(r) as OfflineIdentity : null }
  catch { return null }
}

// ── Data cache (shoppingList + weekPlan + mealsData for offline reading) ───────
export function saveDataCache(cache: OfflineDataCache): void {
  try { localStorage.setItem(KEY_CACHE, JSON.stringify(cache)) } catch {}
}
export function loadDataCache(): OfflineDataCache | null {
  try { const r = localStorage.getItem(KEY_CACHE); return r ? JSON.parse(r) as OfflineDataCache : null }
  catch { return null }
}

// ── Wipe everything on logout ─────────────────────────────────────────────────
export function clearAllOfflineData(): void {
  try {
    localStorage.removeItem(KEY_IDENTITY)
    localStorage.removeItem(KEY_CACHE)
    localStorage.removeItem(KEY_PENDING)
    localStorage.removeItem(KEY_DELETED)
  } catch {}
}
