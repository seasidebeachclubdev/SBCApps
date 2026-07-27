// Managers add a staff member: creates the login, inserts the employees
// row, and sends a set-your-password email that lands on the right app.
import {
  corsHeaders, json, adminClient,
  getCallerEmployee,
} from '../_shared/helpers.ts'

const MANAGER_ROLES = ['ops_manager', 'business_manager']

// UI roles map onto the underlying role/area pair and the app they use
const ROLE_MAP: Record<string, { role: string; area: string; app: string }> = {
  manager: { role: 'ops_manager', area: 'Manager', app: 'https://admin.sbcri.com' },
  gate:    { role: 'gate_device', area: 'Gate',    app: 'https://admin.sbcri.com' },
  kitchen: { role: 'employee',    area: 'Kitchen', app: 'https://staff.sbcri.com' },
  labor:   { role: 'employee',    area: 'Labor',   app: 'https://staff.sbcri.com' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  const name = String(body?.name ?? '').trim().slice(0, 120)
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200)
  const roleKey = String(body?.role ?? '')
  const mapped = ROLE_MAP[roleKey]
  if (!name || !mapped || !EMAIL_RE.test(email)) {
    return json({ error: 'name, valid email, and role (manager|kitchen|gate|labor) required' }, 400)
  }

  const caller = await getCallerEmployee(req)
  if (!caller) return json({ error: 'unauthorized' }, 401)
  if (!MANAGER_ROLES.includes(caller.role)) return json({ error: 'forbidden' }, 403)

  const db = adminClient()

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    return json({ error: `could not create login: ${createError?.message ?? 'unknown'}` }, 409)
  }

  const { error: insertError } = await db.from('employees').insert({
    auth_user_id: created.user.id,
    name,
    email,
    role: mapped.role,
    area: mapped.area,
    since: new Date().getFullYear(),
  })
  if (insertError) {
    await db.auth.admin.deleteUser(created.user.id) // no orphan logins
    return json({ error: `could not add employee: ${insertError.message}` }, 409)
  }

  const recover = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/auth/v1/recover?redirect_to=${encodeURIComponent(mapped.app)}`,
    {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
  )

  return json({ ok: true, invite_sent: recover.ok })
})
