import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '../../../../lib/pushLogic'

async function getCallerInfo(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: row } = await admin
    .from('family_members')
    .select('family_id, kuerzel')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return null
  return { userId: user.id, familyId: row.family_id as string, memberId: row.kuerzel as string }
}

export async function GET(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })

  const admin = getAdminClient()
  const { data } = await admin
    .from('push_settings')
    .select('reminder_vortag, reminder_kochtag, reminder_wochenchef')
    .eq('user_id', caller.userId)
    .maybeSingle()

  return NextResponse.json({
    settings: {
      reminder_vortag: data?.reminder_vortag ?? true,
      reminder_kochtag: data?.reminder_kochtag ?? true,
      reminder_wochenchef: data?.reminder_wochenchef ?? true,
    },
  })
}

export async function POST(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })

  const body = await req.json() as {
    settings?: { reminder_vortag?: boolean; reminder_kochtag?: boolean; reminder_wochenchef?: boolean }
  }
  if (!body.settings) return NextResponse.json({ error: 'Keine settings.' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.from('push_settings').upsert(
    {
      user_id: caller.userId,
      family_id: caller.familyId,
      member_id: caller.memberId,
      reminder_vortag: body.settings.reminder_vortag ?? true,
      reminder_kochtag: body.settings.reminder_kochtag ?? true,
      reminder_wochenchef: body.settings.reminder_wochenchef ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.error('[push/settings] upsert error:', error)
    const msg = error.code === '22P02'
      ? 'Datenbankfehler: Spaltentyp stimmt nicht überein (family_id). SQL-Migration prüfen.'
      : `Speichern fehlgeschlagen: ${error.message ?? error.code ?? 'unbekannt'}`
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
