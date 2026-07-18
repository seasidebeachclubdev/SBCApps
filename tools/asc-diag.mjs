// Diagnoses App Store Connect API access for the Codemagic signing flow:
// can the key see the bundle ID, distribution certificates, and profiles?
import { readFileSync } from 'node:fs'
import { SignJWT, importPKCS8 } from 'jose'

const KEY_ID = 'QZ7J4NRBWW'
const ISSUER = '15e65bf2-c156-4c92-aedc-8f82794b2a0d'
const P8 = readFileSync('/mnt/c/Users/ryanm/Code/SBC-mobile/keystore/AuthKey_QZ7J4NRBWW.p8', 'utf8')

const key = await importPKCS8(P8, 'ES256')
const token = await new SignJWT({ aud: 'appstoreconnect-v1' })
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  .setIssuer(ISSUER)
  .setIssuedAt()
  .setExpirationTime('15m')
  .sign(key)

async function get(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

console.log('=== bundle id ===')
const bundles = await get('/v1/bundleIds?filter[identifier]=com.sbcri.member')
console.log('status', bundles.status)
for (const b of bundles.body?.data ?? []) console.log(' ', b.id, b.attributes.identifier, b.attributes.platform)
if (bundles.body?.errors) console.log(JSON.stringify(bundles.body.errors))

console.log('=== certificates ===')
const certs = await get('/v1/certificates?limit=20')
console.log('status', certs.status)
for (const c of certs.body?.data ?? []) console.log(' ', c.id, c.attributes.certificateType, c.attributes.displayName, 'expires', c.attributes.expirationDate?.slice(0, 10))
if ((certs.body?.data ?? []).length === 0) console.log('  (none)')
if (certs.body?.errors) console.log(JSON.stringify(certs.body.errors))

console.log('=== profiles ===')
const profiles = await get('/v1/profiles?limit=20')
console.log('status', profiles.status)
for (const p of profiles.body?.data ?? []) console.log(' ', p.id, p.attributes.profileType, p.attributes.name, p.attributes.profileState)
if ((profiles.body?.data ?? []).length === 0) console.log('  (none)')
if (profiles.body?.errors) console.log(JSON.stringify(profiles.body.errors))
