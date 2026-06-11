// Broadcast email to members from the admin Comms screen.
// Caller must be an ops_manager or business_manager.
import {
  corsHeaders, json, adminClient,
  getCallerEmployee,
  sendEmailBatch, emailShell,
} from '../_shared/helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.subject || !body?.message) return json({ error: 'subject and message required' }, 400)
  const recipients = body.recipients ?? 'all'

  const employee = await getCallerEmployee(req)
  if (!employee) return json({ error: 'unauthorized' }, 401)
  if (!['ops_manager', 'business_manager'].includes(employee.role)) return json({ error: 'forbidden' }, 403)

  const db = adminClient()
  let query = db.from('members').select('email, first_name, member_id').eq('active', true).not('email', 'is', null)
  if (recipients === 'family') query = query.eq('membership_type', 'Family')

  let members = (await query).data ?? []

  if (recipients === 'unpaid') {
    const { data: unpaid } = await db.from('guests').select('member_id').eq('paid', false)
    const unpaidIds = new Set((unpaid ?? []).map(g => g.member_id))
    members = members.filter(m => unpaidIds.has(m.member_id))
  }

  if (members.length === 0) return json({ ok: true, sent: 0 })

  const html = emailShell(body.subject, `
    <div style="white-space:pre-wrap">${body.message}</div>
    ${body.sent_by ? `<p style="font-size:12px;color:#6b6b6b;margin-top:18px">- ${body.sent_by}, Seaside Beach Club</p>` : ''}
  `)

  const result = await sendEmailBatch(
    members.map(m => ({ to: m.email, subject: body.subject, html })),
  )

  return json({ ok: true, sent: result.count ?? 0, skipped: result.skipped ?? false })
})
