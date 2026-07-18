// Creates the iOS distribution certificate + App Store provisioning profile
// via the App Store Connect API, and packages them for Codemagic:
//   - sbc-dist.p12 (certificate + private key, password in the info file)
//   - SBC_Member_App_Store.mobileprovision
// Output: C:\Users\ryanm\Code\SBC-mobile\keystore\ios-signing\
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { SignJWT, importPKCS8 } from 'jose'

const KEY_ID = 'QZ7J4NRBWW'
const ISSUER = '15e65bf2-c156-4c92-aedc-8f82794b2a0d'
const BUNDLE_ID_RESOURCE = 'FBB88KU9BB' // com.sbcri.member
const DIR = '/mnt/c/Users/ryanm/Code/SBC-mobile/keystore/ios-signing'
mkdirSync(DIR, { recursive: true })

const P8 = readFileSync('/mnt/c/Users/ryanm/Code/SBC-mobile/keystore/AuthKey_QZ7J4NRBWW.p8', 'utf8')
const key = await importPKCS8(P8, 'ES256')
const token = await new SignJWT({ aud: 'appstoreconnect-v1' })
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  .setIssuer(ISSUER).setIssuedAt().setExpirationTime('15m').sign(key)

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json?.errors ?? json)}`)
  return json
}

// 1. private key + CSR
execSync(`openssl genrsa -out ${DIR}/dist-key.pem 2048`, { stdio: 'pipe' })
execSync(`openssl req -new -key ${DIR}/dist-key.pem -out ${DIR}/dist.csr -subj "/CN=Seaside Beach Club/O=Seaside Beach Club/C=US"`, { stdio: 'pipe' })
const csr = readFileSync(`${DIR}/dist.csr`, 'utf8')
console.log('csr generated')

// 2. distribution certificate
const cert = await api('POST', '/v1/certificates', {
  data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } },
})
const certId = cert.data.id
writeFileSync(`${DIR}/dist-cert.der`, Buffer.from(cert.data.attributes.certificateContent, 'base64'))
execSync(`openssl x509 -inform DER -in ${DIR}/dist-cert.der -out ${DIR}/dist-cert.pem`, { stdio: 'pipe' })
console.log('certificate created:', certId, cert.data.attributes.displayName ?? '')

// 3. App Store provisioning profile
const profile = await api('POST', '/v1/profiles', {
  data: {
    type: 'profiles',
    attributes: { name: 'SBC Member App Store', profileType: 'IOS_APP_STORE' },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: BUNDLE_ID_RESOURCE } },
      certificates: { data: [{ type: 'certificates', id: certId }] },
    },
  },
})
writeFileSync(`${DIR}/SBC_Member_App_Store.mobileprovision`,
  Buffer.from(profile.data.attributes.profileContent, 'base64'))
console.log('profile created:', profile.data.id, profile.data.attributes.name)

// 4. p12 bundle for Codemagic
const p12pw = 'SBC-' + randomBytes(12).toString('base64url')
execSync(`openssl pkcs12 -export -inkey ${DIR}/dist-key.pem -in ${DIR}/dist-cert.pem -out ${DIR}/sbc-dist.p12 -passout pass:${p12pw}`, { stdio: 'pipe' })

writeFileSync(`${DIR}/IOS-SIGNING-INFO.txt`, `iOS App Store signing assets (created via ASC API)
certificate id: ${certId} (Apple Distribution, team 7JUDX8K44R)
profile:        SBC Member App Store (IOS_APP_STORE, com.sbcri.member)

Upload to Codemagic -> Team settings -> codemagic.yaml settings ->
Code signing identities:
  iOS certificates:          sbc-dist.p12   password: ${p12pw}
      reference name:        sbc_distribution
  iOS provisioning profiles: SBC_Member_App_Store.mobileprovision
      reference name:        sbc_member_appstore

Keep this folder with the rest of the club signing material.
`)
console.log('p12 packaged; info written')
