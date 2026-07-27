// Seeds weekly schedule patterns for swap/schedule testing:
//  - test.employee:  Tue + Thu 9:00-17:00 (kitchen)
//  - test.employee2: Tue 11:00-19:00, Wed 9:00-17:00 (kitchen; created if missing)
// Materializes the next 14 days and drops employee2's next Wednesday
// shift so the staff app's Swap screen has an open shift to claim.
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

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await db.connect()

// second kitchen worker for pickup testing
const E2 = 'test.employee2@sbcri.com'
let e2 = (await db.query('select id from public.employees where email = $1', [E2])).rows[0]
if (!e2) {
  const created = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ email: E2, password: 'TestEmployee2026!', email_confirm: true }),
  }).then(r => r.json())
  const uid = created.id ?? created.user?.id
  e2 = (await db.query(`
    insert into public.employees (auth_user_id, name, email, role, area, since)
    values ($1, 'Test Employee Two', $2, 'employee', 'Kitchen', 2026) returning id`, [uid, E2])).rows[0]
  console.log('created test.employee2 (password TestEmployee2026!)')
}

const e1 = (await db.query(`select id from public.employees where email = 'test.employee@sbcri.com'`)).rows[0]

// weekly patterns (weekday: 0=Sun .. 6=Sat)
const patterns = [
  [e1.id, 2, '09:00', '17:00'], // employee 1: every Tuesday
  [e1.id, 4, '09:00', '17:00'], // every Thursday
  [e2.id, 2, '11:00', '19:00'], // employee 2: every Tuesday
  [e2.id, 3, '09:00', '17:00'], // every Wednesday
]
for (const [emp, wd, s, en] of patterns) {
  await db.query(`
    insert into public.schedule_templates (employee_id, weekday, start_time, end_time, area)
    values ($1, $2, $3, $4, 'Kitchen')
    on conflict (employee_id, weekday) do update set start_time = $3, end_time = $4`, [emp, wd, s, en])
}
console.log('weekly patterns saved')

const made = (await db.query('select public.materialize_shifts(14) as n')).rows[0].n
console.log(`materialized ${made} shifts for the next 14 days`)

// pre-drop employee2's next Wednesday so Swap has an open shift
const dropped = await db.query(`
  update public.shifts set status = 'dropped', dropped_reason = 'doctor appointment (seeded test)'
  where employee_id = $1 and status = 'scheduled'
    and shift_date = (select min(shift_date) from public.shifts
                      where employee_id = $1 and status = 'scheduled'
                        and extract(dow from shift_date) = 3 and shift_date > current_date)
  returning shift_date`, [e2.id])
console.log('pre-dropped shift:', JSON.stringify(dropped.rows))

const summary = await db.query(`
  select e.name, s.shift_date, s.start_time, s.end_time, s.status
  from public.shifts s join public.employees e on e.id = s.employee_id
  where s.shift_date >= current_date and e.email like 'test.employee%'
  order by s.shift_date, e.name limit 12`)
summary.rows.forEach(r => console.log(' ', JSON.stringify(r)))
await db.end()
