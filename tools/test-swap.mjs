// End-to-end test of the shift swap state machine (migration 010):
//   drop / take back / claim / withdraw / collision rules / manager approve
//   and the materializer-resurrection regression that double-booked shifts.
// All changes are reverted.
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

async function token(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(r => r.json())
  if (!r.access_token) throw new Error(`login failed for ${email}`)
  return r.access_token
}
const patch = (tok, id, body) => fetch(`${URL_}/rest/v1/shifts?id=eq.${id}`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(body),
}).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }))
const rpc = (tok, fn, body) => fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }))
const row = async id => (await db.query(`select * from public.shifts where id = $1`, [id])).rows[0]

const ids = {}
for (const [k, email] of [['e1', 'test.employee@sbcri.com'], ['e2', 'test.employee2@sbcri.com'], ['gate', 'test.gate@sbcri.com']])
  ids[k] = (await db.query(`select id from public.employees where email = $1`, [email])).rows[0].id

const [tokE1, tokE2, tokMgr] = await Promise.all([
  token('test.employee@sbcri.com', 'TestEmployee2026!'),
  token('test.employee2@sbcri.com', 'TestEmployee2026!'),
  token('test.manager@sbcri.com', 'TestManager2026!'),
])

// The stage: a synthetic Tuesday >14 days out (beyond the materializer
// window, so the daily job never interferes mid-test). e1 has a Tuesday
// 9-5 weekly template, which is what the resurrection regression needs.
const stage = { d: (await db.query(`
  select (current_date + 16 + ((2 - extract(dow from current_date + 16)::int + 7) % 7))::text as d`)).rows[0].d }
stage.a_id = (await db.query(`
  insert into public.shifts (employee_id, shift_date, start_time, end_time, area, status)
  values ($1, $2, '09:00', '17:00', 'Kitchen', 'scheduled') returning id`, [ids.e1, stage.d])).rows[0].id
stage.own_id = (await db.query(`
  insert into public.shifts (employee_id, shift_date, start_time, end_time, area, status)
  values ($1, $2, '11:00', '19:00', 'Kitchen', 'scheduled') returning id`, [ids.e2, stage.d])).rows[0].id
const A = stage.a_id
console.log(`stage: ${stage.d} shift ${A}\n`)

// a second dropped shift the same day (gate employee's), overlapping 9-5
const B = (await db.query(`
  insert into public.shifts (employee_id, shift_date, start_time, end_time, area, status, dropped_reason)
  values ($1, $2, '10:00', '14:00', 'Gate', 'dropped', 'swap test') returning id`, [ids.gate, stage.d])).rows[0].id

let newRowId = null
try {
  // 1. owner drops their shift
  let r = await patch(tokE1, A, { status: 'dropped', dropped_reason: 'test drop' })
  check('owner can drop own shift', r.status < 300 && r.body?.[0]?.status === 'dropped', JSON.stringify(r))

  // 2. owner takes the drop back
  r = await patch(tokE1, A, { status: 'scheduled', dropped_reason: null })
  check('owner can take back an unclaimed drop', r.status < 300 && r.body?.[0]?.status === 'scheduled', JSON.stringify(r))

  // 3. staff cannot edit shift times
  r = await patch(tokE1, A, { start_time: '08:00' })
  check('staff cannot edit shift times', r.status >= 400 && JSON.stringify(r.body).includes('edit shift details'), JSON.stringify(r))

  // 4. drop again for the claim tests
  await patch(tokE1, A, { status: 'dropped', dropped_reason: 'test drop' })

  // 5. claim blocked by claimer's own schedule (e2 works 11-19 that day)
  r = await patch(tokE2, A, { status: 'picked_up', picked_up_by: ids.e2 })
  check('claim rejected on schedule conflict', r.status >= 400 && JSON.stringify(r.body).includes('time conflict'), JSON.stringify(r))

  // park e2's own shift so the rest of the lifecycle can run
  await db.query(`update public.shifts set status = 'cancelled' where id = $1`, [stage.own_id])

  // 6. claim succeeds on a free day
  r = await patch(tokE2, A, { status: 'picked_up', picked_up_by: ids.e2 })
  check('claim allowed when free', r.status < 300 && r.body?.[0]?.status === 'picked_up', JSON.stringify(r))

  // 7. owner cannot take back once claimed
  r = await patch(tokE1, A, { status: 'scheduled', dropped_reason: null })
  check('owner cannot take back a claimed shift', r.status >= 400 && JSON.stringify(r.body).includes('requires a manager'), JSON.stringify(r))

  // 8. pending claim blocks a second overlapping claim (new rule)
  r = await patch(tokE2, B, { status: 'picked_up', picked_up_by: ids.e2 })
  check('second overlapping claim rejected', r.status >= 400 && JSON.stringify(r.body).includes('time conflict'), JSON.stringify(r))

  // 9. claimer withdraws, then re-claims
  r = await patch(tokE2, A, { status: 'dropped', picked_up_by: null })
  check('claimer can withdraw', r.status < 300 && r.body?.[0]?.status === 'dropped' && r.body?.[0]?.picked_up_by === null, JSON.stringify(r))
  await patch(tokE2, A, { status: 'picked_up', picked_up_by: ids.e2 })

  // 10. staff cannot approve
  r = await rpc(tokE2, 'approve_pickup', { p_shift_id: A })
  check('staff cannot approve a pickup', r.status >= 400 && JSON.stringify(r.body).includes('managers only'), JSON.stringify(r))

  // 11. manager approves: owner row becomes a cancelled placeholder,
  //     claimer gets their own scheduled row
  r = await rpc(tokMgr, 'approve_pickup', { p_shift_id: A })
  check('manager approve succeeds', r.status < 300, JSON.stringify(r))
  const orig = await row(A)
  check('owner row is a cancelled placeholder', orig.status === 'cancelled' && orig.approved === true && orig.picked_up_by === ids.e2, JSON.stringify(orig))
  const created = (await db.query(`
    select * from public.shifts where employee_id = $1 and shift_date = $2 and status = 'scheduled' and picked_up_by = $1`,
    [ids.e2, stage.d])).rows[0]
  newRowId = created?.id ?? null
  check('claimer got their own scheduled row', !!created && created.approved === true && created.start_time === '09:00', JSON.stringify(created))

  // 12. the regression: materializing must NOT resurrect the owner's shift
  const mark = (await db.query(`select now() as t`)).rows[0].t
  await db.query(`select public.materialize_shifts(25)`)
  const resurrected = (await db.query(`
    select count(*)::int as n from public.shifts
    where employee_id = $1 and shift_date = $2 and status = 'scheduled'`, [ids.e1, stage.d])).rows[0].n
  check('owner shift NOT resurrected by weekly pattern', resurrected === 0, `${resurrected} scheduled rows for owner`)
  // sweep the extra far-future rows that materialize_shifts(25) created
  await db.query(`delete from public.shifts
    where created_at > $1 and status = 'scheduled' and picked_up_by is null and shift_date > current_date + 14`, [mark])
} finally {
  // remove everything the test created
  if (newRowId) await db.query(`delete from public.shifts where id = $1`, [newRowId])
  await db.query(`delete from public.shifts where id = any($1)`, [[A, B, stage.own_id]])
  console.log('removed test shifts')
  await db.end()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
