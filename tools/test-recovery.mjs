// Password-recovery flow test helper.
//   node test-recovery.mjs link            -> prints app URL with recovery tokens in hash
//   node test-recovery.mjs signin <pw>     -> verifies test.member can sign in with <pw>
//   node test-recovery.mjs restore         -> resets test.member password to TestMember2026!
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL_ = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY
const adminHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }
const EMAIL = 'test.member@sbcri.com'

const [mode, arg] = process.argv.slice(2)

if (mode === 'link') {
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ type: 'recovery', email: EMAIL }),
  })
  const genBody = await gen.json()
  if (!gen.ok) throw new Error(JSON.stringify(genBody))
  const tokenHash = genBody.hashed_token ?? genBody.properties?.hashed_token

  const ver = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', token_hash: tokenHash }),
  })
  const session = await ver.json()
  if (!ver.ok) throw new Error(JSON.stringify(session))

  const hash = [
    `access_token=${session.access_token}`,
    `refresh_token=${session.refresh_token}`,
    `expires_in=${session.expires_in}`,
    `token_type=bearer`,
    `type=recovery`,
  ].join('&')
  console.log(`http://localhost:5173/#${hash}`)
}

if (mode === 'signin') {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: arg }),
  })
  console.log(res.ok ? `PASS sign-in works with "${arg}"` : `FAIL ${JSON.stringify(await res.json())}`)
  process.exit(res.ok ? 0 : 1)
}

if (mode === 'restore') {
  const list = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=100`, { headers: adminHeaders })
  const { users } = await list.json()
  const user = users.find(u => u.email === EMAIL)
  const res = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ password: 'TestMember2026!' }),
  })
  console.log(res.ok ? 'restored to TestMember2026!' : `FAIL ${JSON.stringify(await res.json())}`)
}
