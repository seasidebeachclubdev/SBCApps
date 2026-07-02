// Emails a QR guest pass to the member and (optionally) the guest.
// Caller must be the member who owns the pass, or an employee.
// Guest identity, recipients, and visit date come from the database row -
// client-supplied names and emails are ignored so a caller cannot send
// club-branded mail to arbitrary addresses.
import QRCode from 'npm:qrcode'
import {
  corsHeaders, json, adminClient,
  getCallerMember, getCallerEmployee,
  sendEmail, emailShell, esc,
} from '../_shared/helpers.ts'

function formatVisitDate(d?: string | null) {
  if (!d) return 'Date TBD'
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  if (!body?.guest_id && !(body?.member_id && body?.guest_name)) {
    return json({ error: 'guest_id (or member_id + guest_name) required' }, 400)
  }

  const member = await getCallerMember(req)
  const employee = member ? null : await getCallerEmployee(req)
  if (!member && !employee) return json({ error: 'unauthorized' }, 401)

  const db = adminClient()
  let query = db.from('guests').select('id, guest_name, email, visit_date, member_id')
  query = body.guest_id
    ? query.eq('id', body.guest_id)
    : query.eq('member_id', body.member_id).eq('guest_name', body.guest_name)
        .order('created_at', { ascending: false }).limit(1)
  const { data: guest } = await query.maybeSingle()
  if (!guest) return json({ error: 'guest not found' }, 404)

  // members may only send passes for their own guests
  if (member && guest.member_id !== member.member_id) return json({ error: 'forbidden' }, 403)

  const { data: owner } = await db.from('members')
    .select('first_name, last_name, email, member_id')
    .eq('member_id', guest.member_id)
    .maybeSingle()
  if (!owner) return json({ error: 'member not found' }, 404)

  const visitDate = formatVisitDate(guest.visit_date)
  // pipes delimit the QR payload - strip them from the free-text name
  const safeName = String(guest.guest_name).replace(/\|/g, ' ')
  const qrPayload = `SBCRI|${guest.id}|${safeName}|${visitDate}|${guest.member_id}`
  const dataUrl = await QRCode.toDataURL(qrPayload, { width: 480, margin: 2 })
  const pngBase64 = dataUrl.split(',')[1]
  if (!pngBase64) return json({ error: 'qr generation failed' }, 500)

  const recipients = [owner.email, guest.email].filter(Boolean)
  if (recipients.length === 0) return json({ error: 'no recipient email on file' }, 400)

  const memberName = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.member_id

  const result = await sendEmail({
    to: recipients,
    subject: `SBC Guest Pass - ${guest.guest_name} (${visitDate})`,
    html: emailShell('Guest Pass', `
      <p><strong>${esc(guest.guest_name)}</strong> is registered as a guest of <strong>${esc(memberName)}</strong>.</p>
      <table style="font-size:14px;line-height:1.8">
        <tr><td style="color:#6b6b6b;padding-right:14px">Visit date</td><td><strong>${esc(visitDate)}</strong></td></tr>
        <tr><td style="color:#6b6b6b;padding-right:14px">Guest fee</td><td>$35 - cash or check at the gate</td></tr>
      </table>
      <p>The attached QR code must be scanned at the gate on arrival. Guests must check in immediately, including guests arriving in a member's vehicle.</p>
      <p style="font-size:12px;color:#6b6b6b">The same guest may not visit more than 4 times per season across all members.</p>
    `),
    attachments: [{ filename: 'sbc-guest-pass.png', content: pngBase64 }],
  })

  return json({ ok: true, email: result })
})
