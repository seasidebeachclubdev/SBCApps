// One-off setup:
//  1. agins.dan@gmail.com -> business_manager admin with a set-password
//     email that lands him on admin.sbcri.com
//  2. Ryan Mercier roster row + vehicle so the claim flow can be tested
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
const SECRET = process.env.SUPABASE_SECRET_KEY
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY
const adminHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }

const DAN = 'agins.dan@gmail.com'

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await db.connect()

// --- 1. Dan as business_manager
let res = await fetch(`${URL_}/auth/v1/admin/users`, {
  method: 'POST', headers: adminHeaders,
  body: JSON.stringify({ email: DAN, email_confirm: true }),
})
let body = await res.json()
let uid = body.id ?? body.user?.id
if (!uid) {
  const list = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=200`, { headers: adminHeaders }).then(r => r.json())
  uid = list.users?.find(u => u.email === DAN)?.id
}
if (!uid) throw new Error(`could not create/find auth user for ${DAN}: ${JSON.stringify(body)}`)

await db.query(`
  insert into public.employees (auth_user_id, name, email, role, area, since)
  values ($1, 'Dan Agins', $2, 'business_manager', 'Manager', 2026)
  on conflict (email) do update set auth_user_id = $1, role = 'business_manager', active = true`,
  [uid, DAN])

// set-password email that returns him to the admin dashboard
const recover = await fetch(`${URL_}/auth/v1/recover?redirect_to=${encodeURIComponent('https://admin.sbcri.com')}`, {
  method: 'POST',
  headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: DAN }),
})
console.log(`dan: employees row upserted (business_manager), set-password email sent: ${recover.ok}`)

// --- 2. Ryan on the roster for claim testing
await db.query(`
  insert into public.members (member_id, first_name, last_name, membership_type, member_since, two_stickers, onboarded, active)
  values ('SBC-880', 'Ryan', 'Mercier', 'Family', 2026, true, false, true)
  on conflict (member_id) do nothing`)
await db.query(`
  insert into public.vehicles (member_id, license_plate)
  select 'SBC-880', 'RI RPM880'
  where not exists (select 1 from public.vehicles where member_id = 'SBC-880')`)

const check = await db.query(`
  select m.member_id, m.first_name, m.last_name, m.auth_user_id, v.license_plate
  from public.members m left join public.vehicles v on v.member_id = m.member_id
  where m.member_id = 'SBC-880'`)
console.log('ryan roster row:', JSON.stringify(check.rows[0]))
await db.end()
