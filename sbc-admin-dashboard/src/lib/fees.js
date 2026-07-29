// The club's fee schedule. Mirrors public.guest_fee() in the database,
// which is authoritative - this copy is for showing prices in the UI.
export const FEES = {
  adult: 20,       // guest 18 and over
  child: 10,       // guest under 18
  carWeekday: 50,
  carWeekend: 100,
}

// Saturday and Sunday are weekend rates
export const isWeekendDate = d => {
  if (!d) return false
  const day = new Date(`${d}T00:00:00`).getDay()
  return day === 0 || day === 6
}

export const carFeeFor = d => (isWeekendDate(d) ? FEES.carWeekend : FEES.carWeekday)

export const guestFeeFor = ({ age_group, own_car, visit_date }) =>
  (age_group === 'child' ? FEES.child : FEES.adult) + (own_car ? carFeeFor(visit_date) : 0)

// What a pass is made of. Returns null for a pass recorded under an older
// schedule, so an old charge is never described with today's prices.
export const feeBreakdown = g => {
  const person = g.age_group === 'child' ? FEES.child : FEES.adult
  const car = g.own_car ? carFeeFor(g.visit_date) : 0
  if (g.fee != null && g.fee !== person + car) return null
  const parts = [g.age_group === 'child' ? `under 18 $${FEES.child}` : `18+ $${FEES.adult}`]
  if (g.own_car) parts.push(`car $${car}`)
  return parts.join(' + ')
}

export const GUEST_FEE_TEXT = `$${FEES.adult} per guest 18 and over, $${FEES.child} under 18`
export const CAR_FEE_TEXT = `$${FEES.carWeekday} weekdays, $${FEES.carWeekend} weekends`
