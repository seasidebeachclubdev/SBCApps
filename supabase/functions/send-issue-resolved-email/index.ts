// Emails the reporting member when their issue is marked Resolved.
// Caller must be a manager - the Issues tab is manager-only in the admin app.
import {
  corsHeaders, json, adminClient,
  getCallerEmployee,
  sendEmail, emailShell, esc,
} from '../_shared/helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.issue_id) return json({ error: 'issue_id required' }, 400)

  const employee = await getCallerEmployee(req)
  if (!employee) return json({ error: 'unauthorized' }, 401)
  if (!['ops_manager', 'business_manager'].includes(employee.role)) return json({ error: 'forbidden' }, 403)

  const db = adminClient()
  const { data: issue } = await db
    .from('issues')
    .select('subject, category, member_id')
    .eq('id', body.issue_id)
    .maybeSingle()
  if (!issue) return json({ error: 'issue not found' }, 404)

  const { data: member } = await db
    .from('members')
    .select('first_name, email')
    .eq('member_id', issue.member_id)
    .maybeSingle()
  if (!member?.email) return json({ ok: true, sent: 'none', note: 'member has no email' })

  const result = await sendEmail({
    to: member.email,
    subject: `Your reported issue has been resolved`,
    html: emailShell('Issue Resolved', `
      <p>Hi ${esc(member.first_name ?? 'there')},</p>
      <p>The issue you reported has been marked <strong>Resolved</strong>:</p>
      <table style="font-size:14px;line-height:1.8">
        <tr><td style="color:#6b6b6b;padding-right:14px">Category</td><td>${esc(issue.category)}</td></tr>
        <tr><td style="color:#6b6b6b;padding-right:14px">Subject</td><td><strong>${esc(issue.subject)}</strong></td></tr>
      </table>
      <p>Thank you for helping keep the club in shape. If the problem comes back, submit a new report from the Issues tab.</p>
    `),
  })

  return json({ ok: true, email: result })
})
