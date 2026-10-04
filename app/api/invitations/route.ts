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
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabaseAdmin = getAdminClient()

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Ungültige Session' }, { status: 401 })
  }

  const { data: member } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ invitations: [] })
  }

  const { data: rows } = await supabaseAdmin
    .from('family_invitations')
    .select('id, target_kuerzel, email, invited_role, expires_at, created_at')
    .eq('family_id', member.family_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return NextResponse.json({
    invitations: (rows ?? []).map(i => ({
      id: i.id,
      kuerzel: i.target_kuerzel as string,
      email: i.email as string,
      invitedRole: (i.invited_role ?? 'member') as string,
    })),
  })
}
