// One-off analysis of the club's raw membership CSV.
import { readFileSync } from 'node:fs'

const PATH = '/mnt/c/Users/ryanm/Downloads/_SBC Membership 2026 - Membership 2022.csv'
const raw = readFileSync(PATH, 'utf8')

// minimal CSV parse handling quoted fields
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

const rows = parseCsv(raw)
const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const phoneRe = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/

let withEmail = 0, withPhone = 0, weekday = 0, oneSticker = 0, owes = 0
const colCounts = {}
for (const r of rows) {
  colCounts[r.length] = (colCounts[r.length] || 0) + 1
  const joined = r.join(' ')
  if (emailRe.test(joined)) withEmail++
  if (phoneRe.test(joined)) withPhone++
  if (/weekday/i.test(joined)) weekday++
  if (/one sticker/i.test(joined)) oneSticker++
  if (/owes/i.test(joined)) owes++
}

console.log('total rows:', rows.length)
console.log('column-count distribution:', JSON.stringify(colCounts))
console.log('rows containing an email address:', withEmail)
console.log('rows containing a phone number:', withPhone)
console.log('rows mentioning WEEKDAY:', weekday)
console.log('rows mentioning ONE STICKER:', oneSticker)
console.log('rows mentioning "owes":', owes)
console.log('last 3 rows:', JSON.stringify(rows.slice(-3)))
console.log('longest name field:', rows.reduce((m, r) => (r[1]?.length ?? 0) > m.length ? r[1] : m, ''))
