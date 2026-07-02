// Verifies the 004 protect-triggers through the public API as real users.
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
    method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`signin ${email}: ${JSON.stringify(body)}`)
  return body.access_token
}

async function patch(path, token, body) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} -> ${detail}`) }
}

const mTok = await signIn('test.member@sbcri.com', 'TestMember2026!')

// member CAN still update contact fields on their own row
const okUpdate = await patch('members?member_id=eq.SBC-TEST', mTok, { phone: '401-555-0100' })
check('member can update own phone', okUpdate.status === 200 && okUpdate.body?.length === 1, JSON.stringify(okUpdate))

// member canNOT change membership_type (privilege escalation)
// use a value different from the current one - same-value writes are no-ops
const esc1 = await patch('members?member_id=eq.SBC-TEST', mTok, { membership_type: 'Youth' })
check('member cannot change membership_type', esc1.status >= 400, JSON.stringify(esc1))

// member canNOT change two_stickers
const esc2 = await patch('members?member_id=eq.SBC-TEST', mTok, { two_stickers: true })
check('member cannot change two_stickers', esc2.status >= 400, JSON.stringify(esc2))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
