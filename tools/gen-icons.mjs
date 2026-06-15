// Generates PWA + favicon PNGs from icon-source.svg into a target public dir.
//   node gen-icons.mjs <output-dir>
// Replace icon-source.svg with the club's real logo (square, >=512px) and rerun.
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2]
if (!out) { console.error('usage: node gen-icons.mjs <output-dir>'); process.exit(1) }
mkdirSync(out, { recursive: true })

const svg = readFileSync(join(here, 'icon-source.svg'))
const TEAL = { r: 0x50, g: 0xa2, b: 0xad, alpha: 1 }

// standard PWA + apple touch icons
const sizes = [
  ['pwa-192.png', 192, false],
  ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true], // maskable: padded so safe zone survives Android masking
  ['apple-touch-icon.png', 180, false],
  ['favicon-32.png', 32, false],
]

for (const [name, size, maskable] of sizes) {
  if (maskable) {
    // render logo at 80% on a full-bleed teal background
    const inner = Math.round(size * 0.8)
    const logo = await sharp(svg).resize(inner, inner).png().toBuffer()
    await sharp({ create: { width: size, height: size, channels: 4, background: TEAL } })
      .composite([{ input: logo, gravity: 'center' }])
      .png().toFile(join(out, name))
  } else {
    await sharp(svg).resize(size, size).png().toFile(join(out, name))
  }
  console.log(`  ${name} (${size}px${maskable ? ', maskable' : ''})`)
}
console.log(`icons written to ${out}`)
