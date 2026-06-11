// Imports the master member CSV into Supabase.
//   node import-members.mjs members.csv --dry-run   -> validate + preview only
//   node import-members.mjs members.csv             -> create auth users + members rows
//
// Expected columns (handoff v3.0):
//   member_id, first_name, last_name, email, phone, membership_type,
//   member_since, cabana, two_stickers
//
// Auth users are created WITHOUT a usable password and with email confirmed.
// Members set their password through the "set up your account" email
// (recovery flow) once SMTP is configured - see send-invites mode below.
//
//   node import-members.mjs --send-invites          -> email setup links to
//                                                      members who never signed in
//                                                      (requires Supabase SMTP configured)
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
const adminHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }

const REQUIRED = ['member_id', 'first_name', 'last_name', 'email', 'phone', 'membership_type', 'member_since', 'cabana', 'two_stickers']
const MEMBERSHIP_TYPES = new Set(['Family', 'Sole', 'Additional Adult', 'Youth'])

// minimal CSV parser with quoted-field support
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row) }
  return rows
}

function dbClient() {
  return new pg.Client({
    host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
    user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
}

async function listAllAuthUsers() {
  const users = []
  for (let page = 1; page < 100; page++) {
    const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: adminHeaders })
    const body = await res.json()
    users.push(...(body.users ?? []))
    if ((body.users ?? []).length < 1000) break
  }
  return users
}

const args = process.argv.slice(2)

if (args.includes('--send-invites')) {
  // recovery email doubles as the initial account-setup email
  const client = dbClient()
  await client.connect()
  const { rows } = await client.query(
    `select m.email from public.members m
     join auth.users u on u.id = m.auth_user_id
     where m.active and m.email is not null and u.last_sign_in_at is null`)
  await client.end()
  console.log(`${rows.length} members have never signed in`)
  let sent = 0
  for (const { email } of rows) {
    const res = await fetch(`${URL_}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) sent++
    else console.log(`  failed: ${email} ${res.status}`)
    await new Promise(r => setTimeout(r, 600)) // stay under SMTP rate limits
  }
  console.log(`${sent}/${rows.length} setup emails sent`)
  process.exit(0)
}

const csvPath = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
if (!csvPath) { console.error('usage: node import-members.mjs <file.csv> [--dry-run]'); process.exit(1) }

const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const header = rows[0].map(h => h.trim().toLowerCase())
const missing = REQUIRED.filter(c => !header.includes(c))
if (missing.length) { console.error(`CSV missing columns: ${missing.join(', ')}`); process.exit(1) }

const idx = Object.fromEntries(REQUIRED.map(c => [c, header.indexOf(c)]))
const records = rows.slice(1).map((r, i) => ({
  line: i + 2,
  member_id: r[idx.member_id]?.trim(),
  first_name: r[idx.first_name]?.trim(),
  last_name: r[idx.last_name]?.trim(),
  email: r[idx.email]?.trim().toLowerCase(),
  phone: r[idx.phone]?.trim(),
  membership_type: r[idx.membership_type]?.trim(),
  member_since: parseInt(r[idx.member_since], 10) || null,
  cabana: r[idx.cabana]?.trim() || null,
  two_stickers: ['true', '1', 'yes', 'y'].includes(r[idx.two_stickers]?.trim().toLowerCase()),
}))

// validation
const problems = []
const seenIds = new Set(), seenEmails = new Set()
for (const rec of records) {
  if (!rec.member_id) problems.push(`line ${rec.line}: missing member_id`)
  else if (seenIds.has(rec.member_id)) problems.push(`line ${rec.line}: duplicate member_id ${rec.member_id}`)
  seenIds.add(rec.member_id)
  if (!rec.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) problems.push(`line ${rec.line}: bad email "${rec.email}"`)
  else if (seenEmails.has(rec.email)) problems.push(`line ${rec.line}: duplicate email ${rec.email}`)
  seenEmails.add(rec.email)
  if (rec.membership_type && !MEMBERSHIP_TYPES.has(rec.membership_type)) problems.push(`line ${rec.line}: unknown membership_type "${rec.membership_type}"`)
}

console.log(`${records.length} rows parsed, ${problems.length} problems`)
problems.slice(0, 30).forEach(p => console.log('  ' + p))
if (problems.length > 30) console.log(`  ... and ${problems.length - 30} more`)
if (problems.length) { console.error('\nfix the CSV and re-run'); process.exit(1) }

if (dryRun) {
  console.log('\n--dry-run: no changes made. Sample row:')
  console.log(records[0])
  process.exit(0)
}

const existing = await listAllAuthUsers()
const byEmail = new Map(existing.map(u => [u.email, u.id]))

const client = dbClient()
await client.connect()
let created = 0, linked = 0, failed = 0

for (const rec of records) {
  try {
    let uid = byEmail.get(rec.email)
    if (!uid) {
      const res = await fetch(`${URL_}/auth/v1/admin/users`, {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ email: rec.email, email_confirm: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(body))
      uid = body.id
      created++
    } else linked++

    await client.query(`
      insert into public.members (auth_user_id, member_id, first_name, last_name, email, phone, membership_type, member_since, cabana, two_stickers, onboarded)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
      on conflict (member_id) do update set
        auth_user_id = excluded.auth_user_id, first_name = excluded.first_name,
        last_name = excluded.last_name, email = excluded.email, phone = excluded.phone,
        membership_type = excluded.membership_type, member_since = excluded.member_since,
        cabana = excluded.cabana, two_stickers = excluded.two_stickers`,
      [uid, rec.member_id, rec.first_name, rec.last_name, rec.email, rec.phone,
       rec.membership_type, rec.member_since, rec.cabana, rec.two_stickers])
  } catch (e) {
    failed++
    console.log(`  FAILED ${rec.member_id} (${rec.email}): ${e.message}`)
  }
}

const { rows: count } = await client.query('select count(*)::int as n from public.members')
await client.end()
console.log(`\nauth users created: ${created}, already existed: ${linked}, failed: ${failed}`)
console.log(`members table now has ${count[0].n} rows`)
console.log(`\nnext: configure Supabase SMTP (Resend), then run: node import-members.mjs --send-invites`)
