// Loads the transformed roster (tools/out/*.csv) into the live database.
// Creates NO auth accounts and sends NO invites - members get logins later
// via the claim flow or staff-entered emails. Idempotent: re-running
// replaces household/vehicle rows for imported member_ids only.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row) }
  return rows
}

const load = (name) => parseCsv(readFileSync(join(here, 'out', name), 'utf8')).slice(1) // drop header
const nul = (v) => (v === '' || v == null ? null : v)

const members = load('members.csv')
const household = load('household.csv')
const vehicles = load('vehicles.csv')

const client = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await client.connect()
await client.query('begin')
try {
  for (const [member_id, first, last, email, phone, mtype, since, cabana, two] of members) {
    await client.query(
      `insert into public.members
         (member_id, first_name, last_name, email, phone, membership_type, member_since, cabana, two_stickers, onboarded, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,true)
       on conflict (member_id) do update set
         first_name = excluded.first_name, last_name = excluded.last_name,
         membership_type = excluded.membership_type, member_since = excluded.member_since,
         cabana = excluded.cabana, two_stickers = excluded.two_stickers`,
      [member_id, nul(first), nul(last), nul(email), nul(phone), nul(mtype),
       since ? parseInt(since, 10) : null, nul(cabana), two === 'true'],
    )
  }

  const ids = members.map(m => m[0])
  await client.query('delete from public.household_members where member_id = any($1)', [ids])
  await client.query('delete from public.vehicles where member_id = any($1)', [ids])

  for (const [member_id, full_name] of household) {
    await client.query(
      'insert into public.household_members (member_id, full_name, verified) values ($1,$2,false)',
      [member_id, full_name],
    )
  }
  for (const [member_id, plate] of vehicles) {
    await client.query(
      'insert into public.vehicles (member_id, license_plate) values ($1,$2)',
      [member_id, plate],
    )
  }
  await client.query('commit')
} catch (e) {
  await client.query('rollback')
  console.error('IMPORT FAILED, rolled back:', e.message)
  process.exit(1)
}

const counts = await client.query(`
  select (select count(*) from public.members)           as members,
         (select count(*) from public.household_members) as household,
         (select count(*) from public.vehicles)          as vehicles,
         (select count(*) from public.members where auth_user_id is not null) as with_login`)
console.log('DB totals:', JSON.stringify(counts.rows[0]))
const sample = await client.query(
  `select member_id, first_name, last_name, membership_type, two_stickers
   from public.members where member_id like 'SBC-0%' order by member_id limit 3`)
sample.rows.forEach(r => console.log(' ', JSON.stringify(r)))
await client.end()
