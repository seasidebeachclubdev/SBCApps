// Dry-run transformer: converts the club's raw membership sheet into
// import-ready rows. Writes nothing to the database.
//   node transform-roster.mjs
// Output: tools/out/members.csv, household.csv, vehicles.csv, review.csv + stats
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = '/mnt/c/Users/ryanm/Downloads/_SBC Membership 2026 - Membership 2022.csv'
const OUT = join(here, 'out')
mkdirSync(OUT, { recursive: true })

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row) }
  return rows
}

const csvq = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const toCsv = (header, rows) => [header, ...rows.map(r => r.map(csvq).join(','))].join('\n') + '\n'

const looksLikePlate = (s) => {
  const t = s.trim().replace(/\s+/g, ' ')
  if (!t || /owes|top|\$|new|sticker|windshield/i.test(t)) return false
  if (!/^[A-Z0-9-]{1,8}( [A-Z0-9-]{1,8}){0,2}$/i.test(t) || t.length > 14) return false
  // plain plates contain a digit; vanity plates ride behind a 2-letter state code
  return /\d/.test(t) || /^[A-Z]{2} /i.test(t)
}

// names-vs-notes heuristic for parenthetical content
const looksLikeNames = (s) =>
  s.split(',').every(part => /^[\sA-Z][a-zA-Z.'\s-]*$/.test(part.trim()) && part.trim().length > 1) &&
  !/\d/.test(s)

const rows = parseCsv(readFileSync(SRC, 'utf8'))
const members = [], household = [], vehicles = [], review = []
let seq = 0

for (const r of rows) {
  seq++
  const memberId = `SBC-${String(seq).padStart(3, '0')}`
  const lastName = (r[0] ?? '').trim()
  let nameField = (r[1] ?? '').trim()
  const notes = []

  // membership flags embedded in the name text
  const isWeekday = /\bWEEKDAY\b/i.test(nameField)
  const oneSticker = /\bONE STICKER\b/i.test(nameField)
  const isNew = /\bNEW\b/i.test(nameField)
  nameField = nameField
    .replace(/\bNEW\b/gi, '').replace(/\bWEEKDAY\b/gi, '').replace(/\bONE STICKER\b/gi, '')
    .replace(/\s{2,}/g, ' ').trim()

  // parentheticals: names -> household, anything else -> review note
  const kids = []
  nameField = nameField.replace(/\(([^)]*)\)?/g, (_, inner) => {
    if (looksLikeNames(inner)) kids.push(...inner.split(',').map(s => s.trim()).filter(Boolean))
    else if (inner.trim()) notes.push(inner.trim())
    return ' '
  }).replace(/\s{2,}/g, ' ').trim()

  // "Edward + Julie" / "Allen and Valery" / "Gary & Terry"
  const adults = nameField.split(/\s*(?:\+|&|\band\b)\s*/i).map(s => s.trim()).filter(Boolean)
  const firstName = (adults[0] ?? '').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').trim()
  const spouse = adults.slice(1).join(' & ')

  members.push([
    memberId, firstName, lastName, '', '',                       // email/phone unknown
    isWeekday ? 'Weekday' : 'Family',
    isNew ? 2026 : '',
    '',                                                          // cabana unknown
    oneSticker ? 'false' : 'true',
  ])

  if (spouse) household.push([memberId, spouse.includes(' ') ? spouse : `${spouse} ${lastName}`])
  for (const kid of kids) household.push([memberId, kid.includes(' ') ? kid : `${kid} ${lastName}`])

  for (const plateField of [r[2], r[4]]) {
    const v = (plateField ?? '').trim()
    if (!v) continue
    if (looksLikePlate(v)) vehicles.push([memberId, v.replace(/\s+/g, ' ').toUpperCase()])
    else notes.push(`unparsed vehicle field: ${v}`)
  }

  if (!firstName) notes.push('could not parse a first name')
  if (notes.length) review.push([memberId, lastName, (r[1] ?? '').trim(), notes.join(' | ')])
}

writeFileSync(join(OUT, 'members.csv'),
  toCsv('member_id,first_name,last_name,email,phone,membership_type,member_since,cabana,two_stickers', members))
writeFileSync(join(OUT, 'household.csv'), toCsv('member_id,full_name', household))
writeFileSync(join(OUT, 'vehicles.csv'), toCsv('member_id,license_plate', vehicles))
writeFileSync(join(OUT, 'review.csv'), toCsv('member_id,last_name,original_name_field,notes', review))

console.log(`members:   ${members.length}`)
console.log(`household: ${household.length}`)
console.log(`vehicles:  ${vehicles.length}`)
console.log(`review:    ${review.length} rows need a human look`)
console.log(`weekday:   ${members.filter(m => m[5] === 'Weekday').length}`)
console.log(`one-sticker: ${members.filter(m => m[8] === 'false').length}`)
console.log(`new 2026:  ${members.filter(m => m[6] === 2026).length}`)
console.log('\nsample members:')
members.slice(0, 5).forEach(m => console.log(' ', JSON.stringify(m)))
console.log('\nsample household:')
household.slice(0, 5).forEach(h => console.log(' ', JSON.stringify(h)))
console.log('\nsample review rows:')
review.slice(0, 5).forEach(v => console.log(' ', JSON.stringify(v)))
