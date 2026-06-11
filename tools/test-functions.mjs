// Smoke-tests deployed Edge Functions: auth enforcement + happy path.
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
  return (await res.json()).access_token
}

async function invoke(fn, body, token) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: PUB,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} -> ${detail}`) }
}

// no auth -> rejected
const anon = await invoke('notify-onboarding', { member_id: 'SBC-TEST' })
check('unauthenticated call rejected', anon.status === 401, JSON.stringify(anon))

// member invokes own onboarding notification
const mTok = await signIn('test.member@sbcri.com', 'TestMember2026!')
const ok = await invoke('notify-onboarding', { member_id: 'SBC-TEST', name: 'Test Member' }, mTok)
check('member can invoke notify-onboarding', ok.status === 200 && ok.body?.ok, JSON.stringify(ok))

// member must not be able to broadcast
const blast = await invoke('send-member-email', { recipients: 'all', subject: 'x', message: 'y' }, mTok)
check('member cannot broadcast email', blast.status === 401 || blast.status === 403, JSON.stringify(blast))

// manager can hit checkin function (falls back to email/none without Twilio)
const gTok = await signIn('test.manager@sbcri.com', 'TestManager2026!')
const sms = await invoke('send-checkin-sms', { guest_name: 'Smoke Test', member_id: 'SBC-TEST' }, gTok)
check('manager can invoke send-checkin-sms', sms.status === 200, JSON.stringify(sms))
console.log(`  -> checkin notification path used: ${sms.body?.sent}`)

// member must not be able to hit gate function
const smsAsMember = await invoke('send-checkin-sms', { guest_name: 'x', member_id: 'SBC-TEST' }, mTok)
check('member cannot invoke send-checkin-sms', smsAsMember.status === 401, JSON.stringify(smsAsMember))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
