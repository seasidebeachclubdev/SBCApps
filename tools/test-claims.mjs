// End-to-end test of the account-claim flow against the live backend.
// Creates a throwaway roster member, exercises claim + approve, cleans up.
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
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
const TEST_EMAIL = 'claim.tester@sbcri.com'

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

async function signIn(email, password) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await res.json()).access_token
}

async function invoke(fn, body, token) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: PUB, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ---- setup: throwaway roster member with a vehicle, no login
await db.query(`delete from public.account_claims where email = $1`, [TEST_EMAIL])
await db.query(`delete from public.members where member_id = 'SBC-TST2'`)
await db.query(`
  insert into public.members (member_id, first_name, last_name, membership_type, onboarded, active)
  values ('SBC-TST2', 'Claim', 'Tester', 'Family', false, true)`)
await db.query(`insert into public.vehicles (member_id, license_plate) values ('SBC-TST2', 'RI TEST99')`)

// 1. wrong plate -> generic ok, nothing recorded as matched
const wrong = await invoke('claim-account', { last_name: 'Tester', license_plate: 'RI NOPE11', email: TEST_EMAIL })
const wrongRow = await db.query(`select member_id from public.account_claims where email = $1`, [TEST_EMAIL])
check('wrong plate returns generic ok', wrong.status === 200 && wrong.body?.ok, JSON.stringify(wrong))
check('wrong plate stored as unmatched', wrongRow.rows.length === 1 && wrongRow.rows[0].member_id === null, JSON.stringify(wrongRow.rows))

// 2. sloppy-but-correct plate + last name matches
const good = await invoke('claim-account', { last_name: 'tester', license_plate: '  ri test 99 ', email: TEST_EMAIL, first_name: 'Claim' })
const goodRow = await db.query(
  `select id, member_id from public.account_claims where email = $1 and member_id = 'SBC-TST2' and status = 'pending'`, [TEST_EMAIL])
check('matching claim recorded', good.status === 200 && goodRow.rows.length === 1, JSON.stringify(goodRow.rows))
const claimId = goodRow.rows[0]?.id

// 3. duplicate pending claim for same member is swallowed
await invoke('claim-account', { last_name: 'Tester', license_plate: 'RITEST99', email: TEST_EMAIL })
const dup = await db.query(
  `select count(*)::int as n from public.account_claims where member_id = 'SBC-TST2' and status = 'pending'`)
check('duplicate pending claim not created', dup.rows[0].n === 1, JSON.stringify(dup.rows))

// 4. member cannot review claims
const mTok = await signIn('test.member@sbcri.com', 'TestMember2026!')
const asMember = await invoke('approve-claim', { claim_id: claimId, action: 'approve' }, mTok)
check('member cannot approve claims', asMember.status === 401 || asMember.status === 403, JSON.stringify(asMember))

// 5. kitchen staff cannot review claims
const eTok = await signIn('test.employee@sbcri.com', 'TestEmployee2026!')
const asKitchen = await invoke('approve-claim', { claim_id: claimId, action: 'approve' }, eTok)
check('kitchen employee cannot approve claims', asKitchen.status === 403, JSON.stringify(asKitchen))

// 6. gate device approves -> login created, invite sent
const gTok = await signIn('test.gate@sbcri.com', 'TestGate2026!')
const approved = await invoke('approve-claim', { claim_id: claimId, action: 'approve' }, gTok)
check('gate can approve claim', approved.status === 200 && approved.body?.ok && approved.body?.invite_sent,
  JSON.stringify(approved))
const after = await db.query(`select auth_user_id, email from public.members where member_id = 'SBC-TST2'`)
check('member now has login + email', after.rows[0]?.auth_user_id && after.rows[0]?.email === TEST_EMAIL,
  JSON.stringify(after.rows))

// 7. claiming an already-active member is swallowed
await db.query(`delete from public.account_claims where email = $1`, [TEST_EMAIL])
await invoke('claim-account', { last_name: 'Tester', license_plate: 'RI TEST99', email: TEST_EMAIL })
const reclaim = await db.query(`select count(*)::int as n from public.account_claims where email = $1`, [TEST_EMAIL])
check('active member cannot be re-claimed', reclaim.rows[0].n === 0, JSON.stringify(reclaim.rows))

// ---- cleanup
const uid = after.rows[0]?.auth_user_id
await db.query(`delete from public.account_claims where email = $1`, [TEST_EMAIL])
await db.query(`delete from public.members where member_id = 'SBC-TST2'`)
if (uid) {
  await fetch(`${URL_}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  })
}
console.log('cleanup done')
await db.end()

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
