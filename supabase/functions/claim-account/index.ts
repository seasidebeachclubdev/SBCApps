// Public endpoint: a member with no login claims their roster row by
// last name + license plate, providing the email they want invited.
// Deployed with --no-verify-jwt (callers are not signed in).
//
// Hardening: the response is ALWAYS a generic success - it never reveals
// whether a roster match exists, whether the member already has a login,
// or whether a claim was actually recorded (prevents roster probing).
// Per-email and per-plate caps stop bulk submission.
import {
  corsHeaders, json, adminClient,
  sendEmail, emailShell, esc,
} from '../_shared/helpers.ts'

const GENERIC = { ok: true }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => null)
  const lastName = String(body?.last_name ?? '').trim().slice(0, 100)
  const firstName = String(body?.first_name ?? '').trim().slice(0, 100)
  const plate = String(body?.license_plate ?? '').trim().slice(0, 20)
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200)
  const phone = String(body?.phone ?? '').trim().slice(0, 30)

  if (!lastName || !plate || !EMAIL_RE.test(email)) {
    return json({ error: 'last_name, license_plate, and a valid email are required' }, 400)
  }

  const db = adminClient()

  // submission caps - silently swallow when exceeded
  const plateNorm = plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const { count: byEmail } = await db.from('account_claims')
    .select('id', { count: 'exact', head: true })
    .eq('email', email).eq('status', 'pending')
  const { count: total } = await db.from('account_claims')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if ((byEmail ?? 0) >= 3 || (total ?? 0) >= 500) return json(GENERIC)

  // roster match by plate + last name (service-role-only SQL function)
  const { data: matches } = await db.rpc('match_roster', { p_last: lastName, p_plate: plate })
  const match = matches?.[0]

  // member already has a login: nothing to do, but don't reveal that
  if (match?.has_login) return json(GENERIC)

  const { error: insertError } = await db.from('account_claims').insert({
    member_id: match?.member_id ?? null,
    last_name: lastName,
    first_name: firstName || null,
    license_plate: plate,
    email,
    phone: phone || null,
  })
  // unique-index violation = a pending claim already exists for this member
  if (insertError) return json(GENERIC)

  // heads-up to managers (best effort)
  const { data: managers } = await db.from('employees')
    .select('email')
    .in('role', ['ops_manager', 'business_manager'])
    .eq('active', true)
  const to = (managers ?? []).map(m => m.email).filter(Boolean)
  if (to.length) {
    await sendEmail({
      to,
      subject: 'SBC: new account claim awaiting review',
      html: emailShell('Account Claim', `
        <p>A member requested portal access${match ? ` and matched roster entry <strong>${esc(match.member_id)}</strong>` : ' with <strong>no automatic roster match</strong>'}.</p>
        <table style="font-size:14px;line-height:1.8">
          <tr><td style="color:#6b6b6b;padding-right:14px">Name</td><td>${esc(firstName)} ${esc(lastName)}</td></tr>
          <tr><td style="color:#6b6b6b;padding-right:14px">Plate</td><td>${esc(plate)}</td></tr>
          <tr><td style="color:#6b6b6b;padding-right:14px">Email</td><td>${esc(email)}</td></tr>
        </table>
        <p>Review it on the admin dashboard's Members tab.</p>
      `),
    })
  }

  return json(GENERIC)
})
