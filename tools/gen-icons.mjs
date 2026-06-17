// Generates PWA + favicon PNGs from a source SVG into a target public dir.
//   node gen-icons.mjs <output-dir> [source.svg]
// Source defaults to icon-source.svg; pass a per-app variant for distinct
// home-screen icons. Replace the source with the club's real logo (square,
// full-bleed, >=512px) and rerun.
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2]
const srcArg = process.argv[3] || 'icon-source.svg'
if (!out) { console.error('usage: node gen-icons.mjs <output-dir> [source.svg]'); process.exit(1) }
mkdirSync(out, { recursive: true })

const srcPath = isAbsolute(srcArg) ? srcArg : join(here, srcArg)
const svg = readFileSync(srcPath)

// The source SVGs are full-bleed (the background fills the canvas) with all
// meaningful content inside the central safe zone, so the same render works
// for "any" and "maskable" purposes without a border-color mismatch.
const sizes = [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['pwa-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]

for (const [name, size] of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(out, name))
  console.log(`  ${name} (${size}px)`)
}
console.log(`icons written to ${out} from ${srcArg}`)
