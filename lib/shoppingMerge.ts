import type { ShoppingItem } from './state'
import type { PendingOp } from './offlineCache'

/**
 * Merge: last-write-wins per item, by updatedAt.
 *
 * Rules:
 * - Item in both base and local: keep the one with the later updatedAt
 * - Item only in local (new item): keep it
 * - Item only in base AND not in deletedIds: keep it (added by someone else)
 * - Item only in base AND in deletedIds: exclude (user deleted it)
 */
export function mergeShoppingLists(
  base: ShoppingItem[],
  local: ShoppingItem[],
  deletedIds: string[] = [],
): ShoppingItem[] {
  const deletedSet = new Set(deletedIds)
  const localMap = new Map(local.map(i => [i.id, i]))
  const baseMap  = new Map(base.map(i => [i.id, i]))

  const result = new Map<string, ShoppingItem>()

  // Items from local
  for (const item of local) {
    result.set(item.id, item)
  }

  // Items only in base (added by others) — unless we deleted them
  for (const item of base) {
    if (deletedSet.has(item.id)) continue
    if (!localMap.has(item.id)) {
      result.set(item.id, item)
    } else {
      // Both have it: last-write-wins by updatedAt
      const localItem = localMap.get(item.id)!
      const baseTs  = item.updatedAt ?? '0'
      const localTs = localItem.updatedAt ?? '0'
      if (baseTs > localTs) {
        result.set(item.id, item)
      }
      // else keep local (already in result)
    }
  }

  // Preserve original order from base where possible, new local items go to end
  const baseOrder = base.map(i => i.id)
  const localOnly = local.filter(i => !baseMap.has(i.id)).map(i => i.id)
  const ordered: ShoppingItem[] = []
  for (const id of [...baseOrder, ...localOnly]) {
    const item = result.get(id)
    if (item) ordered.push(item)
  }
  return ordered
}

/**
 * Replay pending ops (recorded while offline) onto a fresh DB list.
 * Ops are applied in chronological order (oldest first).
 */
export function applyPendingOps(
  dbList: ShoppingItem[],
  ops: PendingOp[],
): ShoppingItem[] {
  let list = [...dbList]

  for (const op of ops) {
    if (op.type === 'update') {
      const idx = list.findIndex(i => i.id === op.item.id)
      if (idx >= 0) {
        // Keep DB item if it has a later timestamp
        const dbTs    = list[idx].updatedAt ?? '0'
        const pendTs  = op.item.updatedAt  ?? '0'
        if (pendTs >= dbTs) list[idx] = op.item
      } else {
        list.push(op.item)
      }
    } else if (op.type === 'delete') {
      list = list.filter(i => i.id !== op.id)
    }
  }

  return list
}
