import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

  let defaultMealConfig: Record<string, unknown>
  let defaultPlanWE: boolean | undefined
  try {
    const body = await req.json() as { defaultMealConfig?: unknown; defaultPlanWE?: unknown }
    if (!body.defaultMealConfig || typeof body.defaultMealConfig !== 'object' || Array.isArray(body.defaultMealConfig)) {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
    }
    defaultMealConfig = body.defaultMealConfig as Record<string, unknown>
    if (typeof body.defaultPlanWE === 'boolean') defaultPlanWE = body.defaultPlanWE
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
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

  const isPrivileged = role === 'owner' || role === 'admin' || role === 'parent'

  if (!isPrivileged) {
    const { data: planRow } = await supabaseAdmin
      .from('week_plans')
      .select('wochenchef, next_week_data')
      .eq('family_id', familyId)
      .limit(1)
      .maybeSingle()

    const currentChef = (planRow?.wochenchef as string | null) ?? ''
    const nwChef = ((planRow?.next_week_data as { wochenchef?: string } | null)?.wochenchef) ?? ''

    if (callerKuerzel !== currentChef && callerKuerzel !== nwChef) {
      return NextResponse.json({ error: 'Nur Wochenchefs oder Administratoren dürfen den Standard speichern.' }, { status: 403 })
    }
  }

  const updatePayload: Record<string, unknown> = { default_meal_config: defaultMealConfig }
  if (defaultPlanWE !== undefined) updatePayload.default_plan_we = defaultPlanWE

  const { error: updateError } = await supabaseAdmin
    .from('family_profiles')
    .update(updatePayload)
    .eq('family_id', familyId)

  if (updateError) {
    console.error('save-default-meal-config:', updateError)
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
