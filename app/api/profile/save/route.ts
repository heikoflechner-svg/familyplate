import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

interface FamilyMember {
  id: string
  name: string
  allergien?: string[]
  vorlieben?: string[]
  chefStat?: { count: number; lastCook: string | null }
  wochenchefStat?: { count: number; lastWeek: string | null }
  istKind?: boolean
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  let incomingMembers: FamilyMember[] | undefined
  let incomingLaeden: string[] | undefined
  let incomingZutatenLaden: Record<string, string> | undefined
  try {
    const body = await req.json()
    incomingMembers = Array.isArray(body.members) ? (body.members as FamilyMember[]) : undefined
    incomingLaeden = Array.isArray(body.laeden) ? (body.laeden as string[]) : undefined
    incomingZutatenLaden =
      body.zutatenLaden != null && typeof body.zutatenLaden === 'object' && !Array.isArray(body.zutatenLaden)
        ? (body.zutatenLaden as Record<string, string>)
        : undefined
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  if (incomingMembers === undefined && incomingLaeden === undefined && incomingZutatenLaden === undefined) {
    return NextResponse.json({ error: 'Nichts zu speichern.' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  const { data: callerRow } = await supabaseAdmin
    .from('family_members')
    .select('family_id, role, kuerzel')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!callerRow) {
    return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })
  }

  const { family_id: familyId, role, kuerzel: callerKuerzel } = callerRow as {
    family_id: string; role: string; kuerzel: string
  }
  const isOwnerOrAdmin = role === 'owner' || role === 'admin'
  const isParent = role === 'parent'

  // Load current profile from DB (authoritative source)
  const { data: profileRow } = await supabaseAdmin
    .from('family_profiles')
    .select('members, laeden, zutaten_laden')
    .eq('family_id', familyId)
    .maybeSingle()

  const currentMembers: FamilyMember[] = (profileRow?.members as FamilyMember[] | null) ?? []
  let newLaeden: string[] = (profileRow?.laeden as string[] | null) ?? []
  let newZutatenLaden: Record<string, string> = (profileRow?.zutaten_laden as Record<string, string> | null) ?? {}

  // ── laeden ────────────────────────────────────────────────────────────────
  if (incomingLaeden !== undefined) {
    const changed = JSON.stringify(incomingLaeden) !== JSON.stringify(newLaeden)
    if (changed && !isOwnerOrAdmin && !isParent) {
      return NextResponse.json({ error: 'Keine Berechtigung, Läden zu ändern.' }, { status: 403 })
    }
    newLaeden = incomingLaeden
  }

  // ── zutatenLaden ──────────────────────────────────────────────────────────
  if (incomingZutatenLaden !== undefined) {
    const changed = JSON.stringify(incomingZutatenLaden) !== JSON.stringify(newZutatenLaden)
    if (changed && !isOwnerOrAdmin && !isParent) {
      return NextResponse.json({ error: 'Keine Berechtigung, Laden-Zuordnungen zu ändern.' }, { status: 403 })
    }
    newZutatenLaden = incomingZutatenLaden
  }

  // ── members ───────────────────────────────────────────────────────────────
  let newMembers: FamilyMember[] = currentMembers

  if (incomingMembers !== undefined) {
    if (incomingMembers.length === 0) {
      return NextResponse.json({ error: 'Ungültige Mitgliederliste.' }, { status: 400 })
    }

    // If existing members are present and none of the incoming IDs match any DB ID,
    // this is a complete ID replacement (e.g. DEFAULT_MEMBERS / "Person 1/2/3") — reject always.
    if (currentMembers.length > 0) {
      const incomingIdSet = new Set(incomingMembers.map(m => m.id))
      const hasOverlap = currentMembers.some(m => incomingIdSet.has(m.id))
      if (!hasOverlap) {
        return NextResponse.json({ error: 'Mitgliederliste ungültig – keine bekannten Mitglieds-IDs enthalten.' }, { status: 400 })
      }
    }

    // Adding a member whose ID is not in DB requires owner/admin
    const currentIdSet = new Set(currentMembers.map(m => m.id))
    const addedMembers = incomingMembers.filter(m => !currentIdSet.has(m.id))
    if (addedMembers.length > 0 && !isOwnerOrAdmin) {
      return NextResponse.json({ error: 'Nur Gründer oder Mitverwaltung dürfen Personen hinzufügen.' }, { status: 403 })
    }

    const canEditChildAllergens = isOwnerOrAdmin || isParent

    // Server-side merge: iterate over DB list, apply incoming where allowed
    newMembers = currentMembers.map(dbMember => {
      const incoming = incomingMembers.find(m => m.id === dbMember.id)
      if (!incoming) {
        // Client didn't include this member → keep DB version unchanged
        return dbMember
      }

      const canEdit =
        isOwnerOrAdmin ||
        callerKuerzel === dbMember.id ||
        (isParent && !!dbMember.istKind)

      if (!canEdit) {
        // Client sent it but caller has no right to edit → keep DB version
        return dbMember
      }

      return {
        ...dbMember,
        id: dbMember.id, // ID is immutable
        name: incoming.name ?? dbMember.name,
        allergien: (dbMember.istKind && !canEditChildAllergens)
          ? dbMember.allergien
          : (incoming.allergien ?? dbMember.allergien),
        vorlieben: (dbMember.istKind && !canEditChildAllergens)
          ? dbMember.vorlieben
          : (incoming.vorlieben ?? dbMember.vorlieben),
        // only owner/admin can change istKind
        istKind: isOwnerOrAdmin ? incoming.istKind : dbMember.istKind,
        // chefStat is a system counter — any family member may update
        chefStat: incoming.chefStat ?? dbMember.chefStat,
      }
    })

    // Append genuinely new members (owner/admin only, already validated above)
    for (const m of addedMembers) {
      newMembers.push(m)
    }

    // Second pass: wochenchefStat may be updated by any family member (Wochenwechsel counter).
    // Idempotency guard: only apply if lastWeek changes — prevents double-counting on concurrent devices.
    newMembers = newMembers.map(dbMember => {
      const incoming = incomingMembers.find(m => m.id === dbMember.id)
      if (!incoming?.wochenchefStat) return dbMember
      if (incoming.wochenchefStat.lastWeek === (dbMember.wochenchefStat?.lastWeek ?? null)) return dbMember
      return { ...dbMember, wochenchefStat: incoming.wochenchefStat }
    })
  }

  const { error: upsertError } = await supabaseAdmin
    .from('family_profiles')
    .upsert(
      {
        family_id: familyId,
        members: newMembers,
        laeden: newLaeden,
        zutaten_laden: newZutatenLaden,
        onboarding_done: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'family_id' }
    )

  if (upsertError) {
    console.error('profile/save:', upsertError)
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    profile: {
      members: newMembers,
      laeden: newLaeden,
      zutatenLaden: newZutatenLaden,
    },
  })
}
