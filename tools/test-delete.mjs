// End-to-end test of in-app account deletion (Apple 5.1.1(v)).
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
const SECRET = process.env.SUPABASE_SECRET_KEY
const EMAIL = 'delete.tester@sbcri.com'
const PW = 'DeleteTester2026!'

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await db.connect()

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} -> ${detail}`) }
}

// setup: member with a live login
await db.query(`delete from public.members where member_id = 'SBC-TST3'`)
const created = await fetch(`${URL_}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true }),
}).then(r => r.json())
const uid = created.id ?? created.user?.id
await db.query(`
  insert into public.members (member_id, first_name, last_name, email, phone, membership_type, onboarded, active, auth_user_id)
  values ('SBC-TST3', 'Delete', 'Tester', $1, '401-555-0199', 'Family', true, true, $2)`, [EMAIL, uid])

// sign in and delete own account
const tok = (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
}).then(r => r.json())).access_token
check('test member can sign in', !!tok, 'no token')

const del = await fetch(`${URL_}/functions/v1/delete-account`, {
  method: 'POST',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: '{}',
}).then(r => r.json())
check('delete-account returns ok', del?.ok === true, JSON.stringify(del))

const row = (await db.query(`select email, phone, auth_user_id, onboarded, first_name from public.members where member_id = 'SBC-TST3'`)).rows[0]
check('contact details cleared, roster kept',
  row && row.email === null && row.phone === null && row.auth_user_id === null && row.onboarded === false && row.first_name === 'Delete',
  JSON.stringify(row))

const relogin = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
})
check('login no longer works', relogin.status >= 400, `status=${relogin.status}`)

// cleanup
await db.query(`delete from public.members where member_id = 'SBC-TST3'`)
await db.end()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
