// Emails a QR guest pass to the member and (optionally) the guest.
// Caller must be the member who owns the pass, or an employee.
import QRCode from 'npm:qrcode'
import {
  corsHeaders, json, adminClient,
  getCallerMember, getCallerEmployee,
  sendEmail, emailShell,
} from '../_shared/helpers.ts'

function formatVisitDate(d?: string) {
  if (!d) return 'Date TBD'
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.guest_name || !body?.member_id) return json({ error: 'guest_name and member_id required' }, 400)

  const member = await getCallerMember(req)
  const employee = member ? null : await getCallerEmployee(req)
  if (!member && !employee) return json({ error: 'unauthorized' }, 401)
  if (member && member.member_id !== body.member_id) return json({ error: 'forbidden' }, 403)

  const db = adminClient()

  // Resolve guest row id for the QR payload if the client didn't pass it
  let guestId = body.guest_id
  if (!guestId) {
    const { data: g } = await db
      .from('guests')
      .select('id')
      .eq('member_id', body.member_id)
      .eq('guest_name', body.guest_name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    guestId = g?.id
  }
  if (!guestId) return json({ error: 'guest not found' }, 404)

  const visitDate = formatVisitDate(body.visit_date)
  const qrPayload = `SBCRI|${guestId}|${body.guest_name}|${visitDate}|${body.member_id}`
  const dataUrl = await QRCode.toDataURL(qrPayload, { width: 480, margin: 2 })
  const pngBase64 = dataUrl.split(',')[1]

  const recipients = [body.member_email, body.guest_email].filter(Boolean)
  if (recipients.length === 0) return json({ error: 'no recipient email' }, 400)

  const result = await sendEmail({
    to: recipients,
    subject: `SBC Guest Pass - ${body.guest_name} (${visitDate})`,
    html: emailShell('Guest Pass', `
      <p><strong>${body.guest_name}</strong> is registered as a guest of <strong>${body.member_name ?? body.member_id}</strong>.</p>
      <table style="font-size:14px;line-height:1.8">
        <tr><td style="color:#6b6b6b;padding-right:14px">Visit date</td><td><strong>${visitDate}</strong></td></tr>
        <tr><td style="color:#6b6b6b;padding-right:14px">Guest fee</td><td>$35 - cash or check at the gate</td></tr>
      </table>
      <p>The attached QR code must be scanned at the gate on arrival. Guests must check in immediately, including guests arriving in a member's vehicle.</p>
      <p style="font-size:12px;color:#6b6b6b">The same guest may not visit more than 4 times per season across all members.</p>
    `),
    attachments: [{ filename: 'sbc-guest-pass.png', content: pngBase64 }],
  })

  return json({ ok: true, email: result })
})
