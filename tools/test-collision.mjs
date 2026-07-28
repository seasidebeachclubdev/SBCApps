// Verifies the claim time-collision trigger end to end:
//  - employee1 (works Tue 9-5) claiming an overlapping Tue 11-7 drop -> rejected
//  - employee1 claiming a non-overlapping drop on a free day -> allowed
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

const e1 = (await db.query(`select id from public.employees where email = 'test.employee@sbcri.com'`)).rows[0].id
const e2 = (await db.query(`select id from public.employees where email = 'test.employee2@sbcri.com'`)).rows[0].id

// e1's next scheduled shift, and e2's overlapping shift the same day
const target = (await db.query(`
  select s1.shift_date, s2.id as overlap_id
  from public.shifts s1
  join public.shifts s2 on s2.shift_date = s1.shift_date and s2.employee_id = $2
    and s2.status = 'scheduled' and s2.start_time < s1.end_time and s2.end_time > s1.start_time
  where s1.employee_id = $1 and s1.status = 'scheduled' and s1.shift_date > current_date
  order by s1.shift_date limit 1`, [e1, e2])).rows[0]
// a non-overlapping e2 shift on a day e1 is off
const free = (await db.query(`
  select s.id from public.shifts s
  where s.employee_id = $2 and s.status = 'scheduled' and s.shift_date > current_date
    and not exists (select 1 from public.shifts x where x.employee_id = $1
                    and x.shift_date = s.shift_date and x.status in ('scheduled','picked_up'))
  order by s.shift_date limit 1`, [e1, e2])).rows[0]
if (!target || !free) { console.error('test shifts not found', { target, free }); process.exit(1) }

await db.query(`update public.shifts set status = 'dropped', dropped_reason = 'collision test' where id = any($1)`,
  [[target.overlap_id, free.id]])

const tok = (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test.employee@sbcri.com', password: 'TestEmployee2026!' }),
}).then(r => r.json())).access_token

async function claim(id) {
  const res = await fetch(`${URL_}/rest/v1/shifts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: PUB, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'picked_up', picked_up_by: e1, approved: false }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const conflict = await claim(target.overlap_id)
check('overlapping claim rejected by trigger',
  conflict.status >= 400 && JSON.stringify(conflict.body).includes('time conflict'),
  JSON.stringify(conflict))

const ok = await claim(free.id)
check('non-overlapping claim allowed', ok.status < 300 && ok.body?.[0]?.status === 'picked_up', JSON.stringify(ok))

// revert everything
await db.query(`update public.shifts set status = 'scheduled', dropped_reason = null, picked_up_by = null, approved = false where id = any($1)`,
  [[target.overlap_id, free.id]])
console.log('reverted test shifts')
await db.end()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
