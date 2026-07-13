// Deploys the three built apps to Vercel production via the REST API.
// Works with team-scoped tokens that the CLI refuses (CLI validates
// against /v2/user, which team tokens fail). Uploads each dist file by
// SHA then creates a static production deployment per project.
//   node deploy-vercel-rest.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r/g, '')
}
const TOKEN = process.env.VERCEL_TOKEN
const TEAM = 'seaside-developer-s-projects'
const APPS = ['sbc-member-portal', 'sbc-employee-app', 'sbc-admin-dashboard']

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

async function api(path, opts = {}) {
  const res = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers ?? {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

for (const app of APPS) {
  const root = join(here, '..', app)
  const dist = join(root, 'dist')
  const uploads = walk(dist).map(p => ({ name: relative(dist, p).replace(/\\/g, '/'), path: p }))

  // SPA rewrites from the repo config, plus explicit no-build overrides:
  // the files are already built, so the project's "vite build" must not run
  const appConfig = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  const deployConfig = Buffer.from(JSON.stringify({
    ...appConfig, framework: null, buildCommand: null, installCommand: null, outputDirectory: null,
  }))
  uploads.push({ name: 'vercel.json', data: deployConfig })

  const files = []
  for (const f of uploads) {
    const data = f.data ?? readFileSync(f.path)
    const sha = createHash('sha1').update(data).digest('hex')
    const up = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'x-vercel-digest': sha,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    })
    if (!up.ok && up.status !== 200) {
      console.error(`${app}: upload failed for ${f.name}: ${up.status} ${await up.text()}`)
      process.exit(1)
    }
    files.push({ file: f.name, sha, size: data.length })
  }

  const dep = await api('/v13/deployments?skipAutoDetectionConfirmation=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: app,
      project: app,
      target: 'production',
      files,
    }),
  })
  if (dep.status >= 300 || !dep.body?.id) {
    console.error(`${app}: deployment create failed: ${dep.status} ${JSON.stringify(dep.body)}`)
    process.exit(1)
  }

  let state = dep.body.readyState
  for (let i = 0; i < 60 && !['READY', 'ERROR', 'CANCELED'].includes(state); i++) {
    await new Promise(r => setTimeout(r, 3000))
    state = (await api(`/v13/deployments/${dep.body.id}`)).body?.readyState
  }
  console.log(`${app}: ${state}  (${files.length} files) -> https://${app}.vercel.app`)
  if (state !== 'READY') process.exit(1)
}
console.log('all deployments READY')
