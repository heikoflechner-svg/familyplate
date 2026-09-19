'use client'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(`Supabase env vars fehlen: URL=${!!supabaseUrl} KEY=${!!supabaseAnonKey}`)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

let _familyId = ''
export function setFamilyId(id: string): void { _familyId = id }
export function getFamilyId(): string { return _familyId }
