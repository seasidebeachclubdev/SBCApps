// Notifies a member that their guest checked in at the gate.
// Sends SMS when Twilio is configured, otherwise falls back to email.
// Caller must be an employee (gate staff).
import {
  corsHeaders, json, adminClient,
  getCallerEmployee,
  sendSms, sendEmail, emailShell, esc,
} from '../_shared/helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.guest_name || !body?.member_id) return json({ error: 'guest_name and member_id required' }, 400)

  const employee = await getCallerEmployee(req)
  if (!employee) return json({ error: 'unauthorized' }, 401)

  const { data: member } = await adminClient()
    .from('members')
    .select('first_name, email, phone')
    .eq('member_id', body.member_id)
    .maybeSingle()
  if (!member) return json({ error: 'member not found' }, 404)

  const text = `SBC: Your guest ${body.guest_name} has checked in at the gate.`

  if (member.phone) {
    const sms = await sendSms(member.phone, text)
    if (sms.ok) return json({ ok: true, sent: 'sms' })
  }

  if (member.email) {
    const mail = await sendEmail({
      to: member.email,
      subject: `Your guest ${body.guest_name} has arrived`,
      html: emailShell('Guest Check-In', `
        <p>Hi ${esc(member.first_name ?? 'there')},</p>
        <p><strong>${esc(body.guest_name)}</strong> just checked in at the gate as your guest.</p>
        <p style="font-size:12px;color:#6b6b6b">Guest fees are $35 per visit, payable to a gate attendant by cash or check.</p>
      `),
    })
    if (mail.ok) return json({ ok: true, sent: 'email' })
  }

  return json({ ok: true, sent: 'none' })
})
