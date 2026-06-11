// Emails all active ops managers when a member completes onboarding.
// Caller must be that member (or an employee).
import {
  corsHeaders, json, adminClient,
  getCallerMember, getCallerEmployee,
  sendEmail, emailShell,
} from '../_shared/helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.member_id) return json({ error: 'member_id required' }, 400)

  const member = await getCallerMember(req)
  const employee = member ? null : await getCallerEmployee(req)
  if (!member && !employee) return json({ error: 'unauthorized' }, 401)
  if (member && member.member_id !== body.member_id) return json({ error: 'forbidden' }, 403)

  const { data: managers } = await adminClient()
    .from('employees')
    .select('email')
    .eq('role', 'ops_manager')
    .eq('active', true)
  const emails = (managers ?? []).map(m => m.email).filter(Boolean)
  if (emails.length === 0) return json({ ok: true, sent: 0, note: 'no active ops managers' })

  const result = await sendEmail({
    to: emails,
    subject: `Member onboarding completed - ${body.name ?? body.member_id}`,
    html: emailShell('Onboarding Completed', `
      <p><strong>${body.name ?? 'A member'}</strong> (${body.member_id}) just completed account onboarding in the member portal.</p>
      <p>Household names, contact info, and vehicles are now on file. Household members are pending verification on the Members tab.</p>
    `),
  })

  return json({ ok: true, sent: emails.length, email: result })
})
