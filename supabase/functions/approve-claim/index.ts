// Staff review of account claims. Approve creates the member's login and
// sends the set-your-password email; reject just closes the claim.
// Caller must be admin-app staff (gate device, ops manager, business manager).
import {
  corsHeaders, json, adminClient,
  getCallerEmployee,
} from '../_shared/helpers.ts'

const STAFF_ROLES = ['gate_device', 'ops_manager', 'business_manager']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.claim_id || !['approve', 'reject'].includes(body?.action)) {
    return json({ error: 'claim_id and action (approve|reject) required' }, 400)
  }

  const employee = await getCallerEmployee(req)
  if (!employee) return json({ error: 'unauthorized' }, 401)
  if (!STAFF_ROLES.includes(employee.role)) return json({ error: 'forbidden' }, 403)

  const db = adminClient()
  const { data: claim } = await db.from('account_claims')
    .select('*').eq('id', body.claim_id).eq('status', 'pending').maybeSingle()
  if (!claim) return json({ error: 'claim not found or already reviewed' }, 404)

  const review = { reviewed_by: employee.id, reviewed_at: new Date().toISOString() }

  if (body.action === 'reject') {
    await db.from('account_claims').update({ status: 'rejected', ...review }).eq('id', claim.id)
    return json({ ok: true, status: 'rejected' })
  }

  // approve
  const memberId = body.member_id ?? claim.member_id
  if (!memberId) return json({ error: 'claim has no roster match - pass member_id to approve' }, 400)

  const { data: member } = await db.from('members')
    .select('member_id, auth_user_id, email').eq('member_id', memberId).maybeSingle()
  if (!member) return json({ error: 'member not found' }, 404)
  if (member.auth_user_id) return json({ error: 'member already has a login' }, 409)

  // create the auth user; fails cleanly if the email already has an account
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: claim.email,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    return json({ error: `could not create login: ${createError?.message ?? 'unknown'}` }, 409)
  }

  const { error: memberError } = await db.from('members')
    .update({ email: claim.email, phone: claim.phone ?? undefined, auth_user_id: created.user.id })
    .eq('member_id', memberId)
  if (memberError) {
    await db.auth.admin.deleteUser(created.user.id) // roll back the orphan login
    return json({ error: `could not attach login: ${memberError.message}` }, 409)
  }

  // set-your-password email via the proven recovery flow
  const recover = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: claim.email }),
  })

  await db.from('account_claims').update({ status: 'approved', member_id: memberId, ...review }).eq('id', claim.id)

  return json({ ok: true, status: 'approved', member_id: memberId, invite_sent: recover.ok })
})
