// Builds the member app's native icon + splash source images for
// @capacitor/assets, from the member icon variant and splash SVG.
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'sbc-member-portal', 'resources')
mkdirSync(out, { recursive: true })

const icon = readFileSync(join(here, 'icon-source-member.svg'))
const splash = readFileSync(join(here, 'splash-source.svg'))

await sharp(icon).resize(1024, 1024).png().toFile(join(out, 'icon.png'))
await sharp(splash).resize(2732, 2732).png().toFile(join(out, 'splash.png'))
await sharp(splash).resize(2732, 2732).png().toFile(join(out, 'splash-dark.png'))
console.log(`native resources written to ${out}`)
