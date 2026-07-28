// Print the session-related auth settings for the project.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r/g, '')
}

const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})
const cfg = await res.json()
const keys = ['jwt_exp', 'refresh_token_rotation_enabled', 'security_refresh_token_reuse_interval',
  'sessions_timebox', 'sessions_inactivity_timeout', 'sessions_single_per_user']
console.log(JSON.stringify(Object.fromEntries(keys.map(k => [k, cfg[k]])), null, 2))
