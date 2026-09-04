export type Ampel = 'green' | 'yellow' | 'red'
export type FreezerTyp = 'fertig' | 'roh'
export type WochenSlot = 'Mittag' | 'Abend'
export type Chef = 'PA' | 'MA' | 'TI'
export type Tab = 'woche' | 'gefriertruhe' | 'einkauf' | 'rezepte'

export interface FreezerItem {
  id: string
  typ: FreezerTyp
  emoji: string
  name: string
  menge: string
  datum: string
  ampel: Ampel
}

export interface PantryItem {
  id: string
  emoji: string
  name: string
  menge: string
  ampel: Ampel
}

export interface WeekPlanEntry {
  tag: string
  slot: WochenSlot
  emoji: string
  gericht: string
  minuten: number
  quelle: string
  chef: Chef
}

export interface ChangeProposal {
  id: string
  tag: string
  slot: WochenSlot
  vonChef: Chef
  fuerChef: Chef
  entry: WeekPlanEntry
  createdAt: string
}

export type Wish = {
  id: string
  person: Chef
  tag: string
  slot: WochenSlot
  postConfirm?: boolean
} & (
  | { type: 'alternative'; emoji: string; dishName: string }
  | { type: 'ergaenzung'; text: string }
)

export interface RemyVorschlag {
  emoji: string
  name: string
  info: string
  minuten: number
}

export interface Rezeptzutat {
  menge: string
  name: string
  typ: string
}

export interface Rezept {
  name: string
  emoji: string
  zutaten: Rezeptzutat[]
  schritte: string[]
  minuten: number
  schwierigkeit: string
  ersetzteZutaten?: string[]
}

export interface ShoppingItem {
  id: string
  name: string
  menge: string
  kategorie: string
  erledigt: boolean
  tag?: string
  slot?: WochenSlot
  gericht?: string
}

export interface DayAttendance {
  tag: string
  mittagAnwesend: Chef[]
  abendAnwesend: Chef[]
  gaeste: number
}

export interface ChefStat {
  count: number
  lastCook: string | null
}

export interface FamilyMember {
  id: Chef
  name: string
  allergien: string[]
  vorlieben: string[]
  chefStat?: ChefStat
}

export interface FamilyProfile {
  members: FamilyMember[]
}

export interface AppState {
  weekPlan: WeekPlanEntry[]
  mealsData: Record<string, Rezept>
  planMittag: boolean
  planWE: boolean
  freezerItems: FreezerItem[]
  pantryItems: PantryItem[]
  wishes: Wish[]
  zustimmungen: string[]
  vorschlaege: RemyVorschlag[]
  choDay: string
  choSlot: WochenSlot | ''
  shoppingList: ShoppingItem[]
  activeTab: Tab
  loading: boolean
  remyLoading: boolean
}

export const INITIAL_STATE: AppState = {
  weekPlan: [],
  mealsData: {},
  planMittag: true,
  planWE: false,
  freezerItems: [],
  pantryItems: [],
  wishes: [],
  zustimmungen: [],
  vorschlaege: [],
  choDay: '',
  choSlot: '',
  shoppingList: [],
  activeTab: 'woche',
  loading: false,
  remyLoading: false,
}
