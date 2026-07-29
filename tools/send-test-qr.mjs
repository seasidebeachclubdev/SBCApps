// Creates a fresh, unused guest pass on Ryan's member record (SBC-880) for
// today and emails the QR code via the send-guest-qr Edge Function, so the
// gate scanner can be tested end to end.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r/g, '')
}
const URL_ = process.env.SUPABASE_URL
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY

const GUEST_NAME = 'QR Test Guest'
const GUEST_EMAIL = 'ryanmercier77@gmail.com'
const MEMBER = 'SBC-880'

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await db.connect()

// one clean, unused pass for today - clear any leftover from a previous run
await db.query(`delete from guests where member_id = $1 and guest_name = $2`, [MEMBER, GUEST_NAME])
// the club's local date, not current_date: after 8pm EDT that is already tomorrow in UTC
const { rows } = await db.query(
  `insert into guests (member_id, member_name, guest_name, email, visit_date, fee, paid)
   values ($1, 'Ryan Mercier', $2, $3, (now() at time zone 'America/New_York')::date, 35, false)
   returning id, visit_date`,
  [MEMBER, GUEST_NAME, GUEST_EMAIL])
const guest = rows[0]
console.log(`guest pass created: ${guest.id} for ${guest.visit_date.toISOString().slice(0, 10)}`)

// an employee may send a pass for any member
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test.manager@sbcri.com', password: 'TestManager2026!' }),
}).then(r => r.json())
if (!auth.access_token) { console.error('login failed', auth); process.exit(1) }

const res = await fetch(`${URL_}/functions/v1/send-guest-qr`, {
  method: 'POST',
  headers: { apikey: PUB, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ guest_id: guest.id }),
})
console.log(`send-guest-qr -> ${res.status}`, await res.text())
await db.end()
