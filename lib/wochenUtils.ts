import type { Chef } from './state'

export function getWochenchefUtil(woche: 'cw' | 'nw', cwChef: Chef, nwChef: Chef | undefined): Chef {
  return woche === 'cw' ? cwChef : (nwChef ?? '')
}

export function canEditWeekUtil(person: Chef, woche: 'cw' | 'nw', cwChef: Chef, nwChef: Chef | undefined, canEditSettings: boolean): boolean {
  if (canEditSettings) return true
  const chef = getWochenchefUtil(woche, cwChef, nwChef)
  return !!chef && person === chef
}
