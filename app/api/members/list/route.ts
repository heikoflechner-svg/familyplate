import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session.' }, { status: 401 })
  }

  const { data: callerRow } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!callerRow) {
    return NextResponse.json({ error: 'Kein Familienmitglied.' }, { status: 403 })
  }

  const { data: members, error } = await supabaseAdmin
    .from('family_members')
    .select('kuerzel, role, user_id')
    .eq('family_id', (callerRow as { family_id: string }).family_id)

  if (error) {
    console.error('members/list:', error)
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 })
  }

  return NextResponse.json({
    members: (members ?? []).map(m => ({
      kuerzel: m.kuerzel as string,
      role: m.role as string,
      isLinked: m.user_id != null,
    })),
  })
}
