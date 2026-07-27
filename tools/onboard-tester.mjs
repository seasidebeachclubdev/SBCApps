// Throwaway member for verifying the onboarding flow end to end.
//   node onboard-tester.mjs setup    -> auth user + not-onboarded roster row
//   node onboard-tester.mjs verify   -> asserts DB state after UI onboarding
//   node onboard-tester.mjs cleanup  -> removes member + auth user
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
const adminHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }
const EMAIL = 'onboard.tester@sbcri.com'
const MID = 'SBC-TST5'

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await db.connect()

const mode = process.argv[2]

async function findUser() {
  const list = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=200`, { headers: adminHeaders }).then(r => r.json())
  return list.users?.find(u => u.email === EMAIL)
}

if (mode === 'setup') {
  await db.query(`delete from public.members where member_id = $1`, [MID])
  const existing = await findUser()
  if (existing) await fetch(`${URL_}/auth/v1/admin/users/${existing.id}`, { method: 'DELETE', headers: adminHeaders })
  const created = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ email: EMAIL, password: 'OnboardTester2026!', email_confirm: true }),
  }).then(r => r.json())
  const uid = created.id ?? created.user?.id
  await db.query(`
    insert into public.members (member_id, first_name, last_name, email, membership_type, two_stickers, onboarded, active, auth_user_id)
    values ($1, 'Onboard', 'Tester', $2, 'Family', true, false, true, $3)`, [MID, EMAIL, uid])
  console.log(`setup done: ${EMAIL} / OnboardTester2026! -> ${MID} (onboarded=false)`)
}

if (mode === 'verify') {
  const m = (await db.query(`select onboarded, phone from public.members where member_id = $1`, [MID])).rows[0]
  const hh = (await db.query(`select full_name, verified from public.household_members where member_id = $1`, [MID])).rows
  const vv = (await db.query(`select make, model, color, license_plate from public.vehicles where member_id = $1`, [MID])).rows
  let pass = 0, fail = 0
  const check = (name, cond, detail) => { if (cond) { pass++; console.log(`PASS  ${name}`) } else { fail++; console.log(`FAIL  ${name} -> ${detail}`) } }
  check('member marked onboarded', m?.onboarded === true, JSON.stringify(m))
  check('phone saved', !!m?.phone, JSON.stringify(m))
  check('exactly one household row', hh.length === 1, JSON.stringify(hh))
  check('vehicle saved with license_plate', vv.length === 1 && !!vv[0].license_plate, JSON.stringify(vv))
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
}

if (mode === 'cleanup') {
  await db.query(`delete from public.members where member_id = $1`, [MID])
  const u = await findUser()
  if (u) await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: adminHeaders })
  console.log('cleanup done')
}

await db.end()
