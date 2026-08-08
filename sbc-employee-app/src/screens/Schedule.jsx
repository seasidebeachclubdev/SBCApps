import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'
import Icon from '../components/Icon'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function Schedule() {
  const { employee } = useAuth()
  const [shifts, setShifts] = useState([])
  const [assignment, setAssignment] = useState(null)

  useEffect(() => { fetchSchedule() }, [])

  async function fetchSchedule() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const end = new Date(monday)
    end.setDate(monday.getDate() + 13) // this week + next week

    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('shift_date', localDateStr(monday))
      .lte('shift_date', localDateStr(end))
      .order('shift_date')

    setShifts(data || [])

    // Fetch kitchen/labor assignment for today
    const todayStr = localDateStr(today)
    if (employee.area === 'Kitchen' || employee.area === 'Snack Bar') {
      const { data: ka } = await supabase.from('kitchen_assignments').select('station').eq('employee_id', employee.id).eq('shift_date', todayStr).maybeSingle()
      if (ka) setAssignment({ type: 'kitchen', value: ka.station })
    } else if (employee.area === 'Labor') {
      const { data: la } = await supabase.from('labor_assignments').select('duty, slot').eq('employee_id', employee.id).eq('shift_date', todayStr).maybeSingle()
      if (la) setAssignment({ type: 'labor', duty: la.duty, slot: la.slot })
    }
  }

  const today = new Date()
  const todayStr = localDateStr(today)

  // Build week grid
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  const weekDays = offset => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset + i)
    return { date: localDateStr(d), dayLabel: DAY_LABELS[(monday.getDay() + i) % 7], initial: DAY_INITIALS[(monday.getDay() + i) % 7] }
  })

  // status → badge; a day can hold several shifts (own + a pickup)
  const badgeFor = s =>
    s.status === 'dropped' ? { cls: 'badge-amber', label: 'Drop pending' }
    : s.status === 'picked_up' ? { cls: 'badge-amber', label: 'Claim pending' }
    : { cls: 'badge-blue', label: 'Confirmed' }

  const weekGrid = days => (
    <div className="list-card">
      {days.map(day => {
        const dayShifts = shifts
          .filter(s => s.shift_date === day.date && s.status !== 'cancelled')
          .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        const isToday = day.date === todayStr
        const dotClass = isToday ? 'today' : dayShifts.length ? 'work' : 'off'
        return (
          <div key={day.date} className="shift-row" style={{ background: isToday ? 'rgba(80,162,173,0.06)' : undefined }}>
            <div className={`day-dot ${dotClass}`}>{day.initial}</div>
            <div style={{ flex: 1 }}>
              {dayShifts.length === 0 ? (
                <span style={{ fontSize: 13, color: '#6b6b6b' }}>Day off</span>
              ) : dayShifts.map(shift => (
                <div key={shift.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{shift.start_time} – {shift.end_time}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{shift.area}</div>
                  </div>
                  {isToday && shift.status === 'scheduled'
                    ? <span className="badge badge-green">Today</span>
                    : <span className={`badge ${badgeFor(shift).cls}`}>{badgeFor(shift).label}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="screen">
      {/* Employee card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar" style={{ width: 42, height: 42, fontSize: 15, background: '#b5d4f4', color: '#0c447c' }}>
          {employee.name.split(' ').map(w => w[0]).join('')}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{employee.name}</div>
          <div style={{ fontSize: 12, color: '#6b6b6b' }}>{employee.area} · Week of {monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Today's assignment */}
      {assignment && (
        <>
          <div className="section-label">Today's assignment</div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name={assignment.type === 'kitchen' ? 'utensils' : 'cone'} size={26} style={{ color: 'var(--teal)' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{assignment.type === 'kitchen' ? assignment.value : assignment.duty}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                {assignment.type === 'kitchen' ? `Kitchen · ${employee.area}` : `Labor · Slot ${assignment.slot?.replace('s', '')}`}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Week schedules */}
      <div className="section-label">This week</div>
      {weekGrid(weekDays(0))}
      <div className="section-label">Next week</div>
      {weekGrid(weekDays(7))}
    </div>
  )
}
