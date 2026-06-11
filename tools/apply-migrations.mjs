// Applies SQL files in ../supabase/migrations in filename order.
// Connects via the Supabase session pooler (IPv4) with direct-connection fallback.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

// minimal .env loader
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const ref = process.env.SUPABASE_PROJECT_REF
const password = process.env.SUPABASE_DB_PASSWORD

const candidates = [
  { host: `aws-0-us-west-2.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-1-us-west-2.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-0-us-west-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-1-us-west-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
]

async function connect() {
  for (const c of candidates) {
    const client = new pg.Client({
      host: c.host, port: c.port, user: c.user, password,
      database: 'postgres', ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    })
    try {
      await client.connect()
      console.log(`connected via ${c.host}`)
      return client
    } catch (e) {
      console.log(`  ${c.host}: ${e.message}`)
    }
  }
  throw new Error('could not connect to any host')
}

const client = await connect()
const dir = join(here, '..', 'supabase', 'migrations')
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()

for (const f of files) {
  process.stdout.write(`applying ${f} ... `)
  try {
    await client.query(readFileSync(join(dir, f), 'utf8'))
    console.log('ok')
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
    await client.end()
    process.exit(1)
  }
}

const { rows: tables } = await client.query(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`)
console.log(`\npublic tables (${tables.length}):`, tables.map(r => r.table_name).join(', '))

const { rows: flag } = await client.query(`select id, color from public.beach_flag`)
console.log('beach_flag seed:', JSON.stringify(flag))

const { rows: rls } = await client.query(
  `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
console.log('tables WITHOUT rls:', rls.length ? rls.map(r => r.relname).join(', ') : 'none')

await client.end()
