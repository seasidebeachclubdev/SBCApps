import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
for (const l of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const c = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: 'postgres.' + process.env.SUPABASE_PROJECT_REF,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const EMAIL = 'ryanmercier77@gmail.com'
const uid = (await c.query('select id from auth.users where email=$1', [EMAIL])).rows[0]?.id
await c.query(
  `insert into public.employees (auth_user_id, name, email, role, area, since)
   values ($1, 'Ryan (Business Mgr)', $2, 'business_manager', 'Manager', 2026)
   on conflict (email) do update set auth_user_id=$1, role='business_manager'`,
  [uid, EMAIL]
)
const row = (await c.query('select name, email, role from public.employees where email=$1', [EMAIL])).rows[0]
console.log('business_manager test account ready:', JSON.stringify(row))
await c.end()
