// Exercises RLS through the public API exactly as the apps will.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL_ = process.env.SUPABASE_URL
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY

async function signIn(email, password) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`signin ${email}: ${JSON.stringify(body)}`)
  return body.access_token
}

async function rest(path, token) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: PUB, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} -> ${detail}`) }
}

// 1. anon: members table must be invisible
const anonMembers = await rest('members?select=member_id')
check('anon cannot read members', Array.isArray(anonMembers.body) && anonMembers.body.length === 0,
  JSON.stringify(anonMembers))

// 2. anon: beach_flag also invisible (authenticated-only)
const anonFlag = await rest('beach_flag?select=color')
check('anon cannot read beach_flag', Array.isArray(anonFlag.body) && anonFlag.body.length === 0,
  JSON.stringify(anonFlag))

// 3. member: sees own row, beach flag, and NOT employees
const mTok = await signIn('test.member@sbcri.com', 'TestMember2026!')
const own = await rest('members?select=member_id,onboarded', mTok)
check('member sees own row', own.body?.length === 1 && own.body[0].member_id === 'SBC-TEST',
  JSON.stringify(own))
const mFlag = await rest('beach_flag?select=color', mTok)
check('member sees beach flag', mFlag.body?.[0]?.color === 'green', JSON.stringify(mFlag))
const mEmp = await rest('employees?select=email', mTok)
check('member cannot see employees', Array.isArray(mEmp.body) && mEmp.body.length === 0,
  JSON.stringify(mEmp))

// 4. employee: sees members (gate lookup) and other employees
const eTok = await signIn('test.employee@sbcri.com', 'TestEmployee2026!')
const eMembers = await rest('members?select=member_id', eTok)
check('employee sees members', eMembers.body?.length >= 1, JSON.stringify(eMembers))
const eEmp = await rest('employees?select=email', eTok)
check('employee sees employees', (eEmp.body?.length ?? 0) >= 3, JSON.stringify(eEmp))

// 5. manager: RPC guest_visit_count works
const gTok = await signIn('test.manager@sbcri.com', 'TestManager2026!')
const rpc = await fetch(`${URL_}/rest/v1/rpc/guest_visit_count`, {
  method: 'POST',
  headers: { apikey: PUB, Authorization: `Bearer ${gTok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_name: 'Nobody Yet', p_email: '', p_phone: '' }),
})
const rpcBody = await rpc.json()
check('guest_visit_count rpc returns 0', rpcBody === 0, JSON.stringify(rpcBody))

// 6. member cannot write beach_flag
const flagWrite = await fetch(`${URL_}/rest/v1/beach_flag?id=eq.00000000-0000-0000-0000-000000000001`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${mTok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ color: 'red' }),
})
const flagWriteBody = await flagWrite.json().catch(() => null)
check('member cannot set beach flag', Array.isArray(flagWriteBody) && flagWriteBody.length === 0,
  `status=${flagWrite.status} ${JSON.stringify(flagWriteBody)}`)

// 7. manager CAN write beach_flag
const mgrWrite = await fetch(`${URL_}/rest/v1/beach_flag?id=eq.00000000-0000-0000-0000-000000000001`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${gTok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ color: 'yellow' }),
})
const mgrWriteBody = await mgrWrite.json()
check('manager can set beach flag', mgrWriteBody?.[0]?.color === 'yellow', JSON.stringify(mgrWriteBody))

// reset flag to green
await fetch(`${URL_}/rest/v1/beach_flag?id=eq.00000000-0000-0000-0000-000000000001`, {
  method: 'PATCH',
  headers: { apikey: PUB, Authorization: `Bearer ${gTok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ color: 'green' }),
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
