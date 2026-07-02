// Runs one SQL file against the project DB: node run-sql-file.mjs <path>
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const file = process.argv[2]
if (!file) { console.error('usage: node run-sql-file.mjs <path>'); process.exit(1) }

const client = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  await client.query(readFileSync(file, 'utf8'))
  console.log(`applied ${file}`)
} catch (e) {
  console.error(`FAILED: ${e.message}`)
  process.exitCode = 1
}
await client.end()
