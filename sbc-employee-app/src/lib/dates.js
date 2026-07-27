// Local calendar date as YYYY-MM-DD. new Date().toISOString() is UTC and
// rolls to tomorrow after ~8pm Eastern - never use it for shift/visit dates.
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Club policy: worked time rounds to the nearest 15 minutes.
export function roundHours(h) {
  return Math.round(h * 4) / 4
}
