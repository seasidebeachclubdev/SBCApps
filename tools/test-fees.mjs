// Verifies the fee schedule is enforced by the database, not the client:
// a member cannot register a guest at a price of their choosing.
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

// the schedule itself
for (const [age, car, date, expected] of [
  ['adult', false, '2026-07-28', 20],   // Tuesday
  ['child', false, '2026-07-28', 10],
  ['adult', true,  '2026-07-28', 70],   // 20 + 50 weekday
  ['adult', true,  '2026-08-01', 120],  // 20 + 100 Saturday
  ['child', true,  '2026-08-02', 110],  // 10 + 100 Sunday
]) {
  const { rows } = await db.query('select public.guest_fee($1, $2, $3::date) as fee', [age, car, date])
  check(`${age}${car ? ' + car' : ''} on ${date} = $${expected}`, rows[0].fee === expected, `got $${rows[0].fee}`)
}

const tok = (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test.member@sbcri.com', password: 'TestMember2026!' }),
}).then(r => r.json())).access_token

// a member trying to set their own price
const res = await fetch(`${URL_}/rest/v1/guests`, {
  method: 'POST',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({
    member_id: 'SBC-TEST', member_name: 'Test Member', guest_name: 'Underpay Test',
    email: 'nobody@example.com', visit_date: '2026-08-01', age_group: 'adult',
    own_car: true, paid_by: 'member', fee: 1, paid: false,
  }),
})
const created = await res.json()
const row = Array.isArray(created) ? created[0] : created
check('client-supplied fee is overridden by the schedule', row?.fee === 120, `got ${JSON.stringify(row?.fee)}`)

// Members cannot edit a pass once created (RLS limits guest updates to
// staff), so repricing is exercised the way it actually happens: the gate
// stamps the real visit day at check-in, which can move a car fee between
// the weekday and weekend rate.
const gateTok = (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test.gate@sbcri.com', password: 'TestGate2026!' }),
}).then(r => r.json())).access_token

if (row?.id) {
  const upd = await fetch(`${URL_}/rest/v1/guests?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { apikey: PUB, Authorization: `Bearer ${gateTok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ visit_date: '2026-07-28' }), // Saturday pass, arrives Tuesday
  }).then(r => r.json())
  check('arriving on a weekday reprices the car fee to $70', upd?.[0]?.fee === 70, `got ${JSON.stringify(upd?.[0]?.fee)}`)
  await db.query('delete from guests where id = $1', [row.id])
}

// a member cannot quietly edit a pass after it is issued
const memberEdit = await fetch(`${URL_}/rest/v1/guests?member_id=eq.SBC-TEST&guest_name=eq.Fee%20Test%20Guest`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ own_car: false }),
}).then(r => r.json())
check('members cannot edit an issued pass', !Array.isArray(memberEdit) || memberEdit.length === 0, JSON.stringify(memberEdit))

// historical rows keep their recorded price when merely marked paid
const { rows: [legacy] } = await db.query(
  `insert into guests (member_id, member_name, guest_name, visit_date, fee, paid, age_group)
   values ('SBC-TEST', 'Test Member', 'Legacy Fee Row', '2026-07-20', 35, false, 'adult') returning id`)
await fetch(`${URL_}/rest/v1/guests?id=eq.${legacy.id}`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ paid: true }),
})
const { rows: [after] } = await db.query('select fee from guests where id = $1', [legacy.id])
check('marking an old $35 pass paid does not reprice it', after.fee === 35, `got $${after.fee}`)
await db.query('delete from guests where id = $1', [legacy.id])

await db.end()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
