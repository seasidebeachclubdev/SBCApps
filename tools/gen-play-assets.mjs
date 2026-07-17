// Play Store marketing assets: 1024x500 feature graphic + 512px icon.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = '/mnt/c/Users/ryanm/Code/SBC-mobile/store-assets/play'

const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#50a2ad"/>
  <circle cx="512" cy="150" r="52" fill="#ffd24a"/>
  <text x="512" y="285" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff" text-anchor="middle">Seaside Beach Club</text>
  <text x="512" y="340" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" letter-spacing="4" fill="#dff0f2" text-anchor="middle">MEMBER PORTAL · GUEST PASSES · TIDES</text>
  <path d="M0 400 q128 -40 256 0 t256 0 t256 0 t256 0 v100 H0 Z" fill="#3d8893"/>
  <path d="M0 445 q128 -40 256 0 t256 0 t256 0 t256 0 v55 H0 Z" fill="#2f6e78"/>
</svg>`

await sharp(Buffer.from(feature)).png().toFile(join(OUT, 'feature-graphic-1024x500.png'))
await sharp(readFileSync(join(here, '..', 'sbc-member-portal', 'resources', 'icon.png')))
  .resize(512, 512).png().toFile(join(OUT, 'icon-512.png'))
console.log('feature graphic + 512 icon written')
