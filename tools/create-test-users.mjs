// Creates test auth users + their members/employees rows. Idempotent.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL_ = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
const ref = process.env.SUPABASE_PROJECT_REF
const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }

const USERS = [
  { email: 'test.member@sbcri.com',   password: 'TestMember2026!',   kind: 'member' },
  { email: 'test.employee@sbcri.com', password: 'TestEmployee2026!', kind: 'employee' },
  { email: 'test.manager@sbcri.com',  password: 'TestManager2026!',  kind: 'manager' },
  { email: 'test.gate@sbcri.com',     password: 'TestGate2026!',     kind: 'gate' },
]

async function ensureAuthUser({ email, password }) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const body = await res.json()
  if (res.ok) return body.id
  // already exists -> look it up
  const list = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=100`, { headers })
  const { users } = await list.json()
  const found = users.find(u => u.email === email)
  if (!found) throw new Error(`create failed for ${email}: ${JSON.stringify(body)}`)
  return found.id
}

const client = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await client.connect()

for (const u of USERS) {
  const uid = await ensureAuthUser(u)
  if (u.kind === 'member') {
    await client.query(`
      insert into public.members (auth_user_id, member_id, first_name, last_name, email, phone, membership_type, member_since, onboarded)
      values ($1, 'SBC-TEST', 'Test', 'Member', $2, '401-555-0100', 'Family', 2020, false)
      on conflict (member_id) do update set auth_user_id = $1, email = $2`, [uid, u.email])
  } else {
    const role = u.kind === 'manager' ? 'ops_manager' : u.kind === 'gate' ? 'gate_device' : 'employee'
    const area = u.kind === 'manager' ? 'Manager' : u.kind === 'gate' ? 'Gate' : 'Kitchen'
    const name = u.kind === 'manager' ? 'Test Manager' : u.kind === 'gate' ? 'Gate iPad' : 'Test Employee'
    await client.query(`
      insert into public.employees (auth_user_id, name, email, role, area, since)
      values ($1, $2, $3, $4, $5, 2024)
      on conflict (email) do update set auth_user_id = $1, role = $4, area = $5`,
      [uid, name, u.email, role, area])
  }
  console.log(`${u.kind.padEnd(8)} ${u.email}  uid=${uid}`)
}

const { rows: m } = await client.query('select member_id, email, onboarded from public.members')
const { rows: e } = await client.query('select name, email, role, area from public.employees')
console.log('\nmembers:', JSON.stringify(m))
console.log('employees:', JSON.stringify(e))
await client.end()
