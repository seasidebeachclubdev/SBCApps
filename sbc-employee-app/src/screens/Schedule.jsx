import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const fmt = d => d.toISOString().slice(0, 10)

    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('shift_date', fmt(monday))
      .lte('shift_date', fmt(sunday))
      .order('shift_date')

    setShifts(data || [])

    // Fetch kitchen/labor assignment for today
    const todayStr = fmt(today)
    if (employee.area === 'Kitchen' || employee.area === 'Snack Bar') {
      const { data: ka } = await supabase.from('kitchen_assignments').select('station').eq('employee_id', employee.id).eq('shift_date', todayStr).single()
      if (ka) setAssignment({ type: 'kitchen', value: ka.station })
    } else if (employee.area === 'Labor') {
      const { data: la } = await supabase.from('labor_assignments').select('duty, slot').eq('employee_id', employee.id).eq('shift_date', todayStr).single()
      if (la) setAssignment({ type: 'labor', duty: la.duty, slot: la.slot })
    }
  }

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // Build week grid
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d.toISOString().slice(0, 10), dayLabel: DAY_LABELS[(monday.getDay() + i) % 7], initial: DAY_INITIALS[(monday.getDay() + i) % 7] }
  })

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
            <span style={{ fontSize: 28 }}>{assignment.type === 'kitchen' ? '🍳' : '🚧'}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{assignment.type === 'kitchen' ? assignment.value : assignment.duty}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                {assignment.type === 'kitchen' ? `Kitchen · ${employee.area}` : `Labor · Slot ${assignment.slot?.replace('s', '')}`}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Week schedule */}
      <div className="section-label">This week</div>
      <div className="list-card">
        {weekDays.map(day => {
          const shift = shifts.find(s => s.shift_date === day.date)
          const isToday = day.date === todayStr
          const dotClass = isToday ? 'today' : shift ? 'work' : 'off'
          return (
            <div key={day.date} className="shift-row" style={{ background: isToday ? 'rgba(80,162,173,0.06)' : undefined }}>
              <div className={`day-dot ${dotClass}`}>{day.initial}</div>
              <div style={{ flex: 1 }}>
                {shift ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{shift.start_time} – {shift.end_time}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{shift.area}</div>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: '#6b6b6b' }}>Day off</span>
                )}
              </div>
              {isToday && <span className="badge badge-green">Today</span>}
              {!isToday && shift && <span className="badge badge-blue">Confirmed</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
