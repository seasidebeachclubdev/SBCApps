// Clock.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

export default function Clock() {
  const { employee } = useAuth()
  const [record, setRecord] = useState(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  const todayStr = localDateStr()

  useEffect(() => { fetchRecord() }, [])

  async function fetchRecord() {
    const { data } = await supabase
      .from('clock_records')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('shift_date', todayStr)
      .maybeSingle()
    setRecord(data || null)
  }

  async function clockIn() {
    if (record?.clock_in) return
    setLoading(true)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('clock_records')
      .upsert(
        { employee_id: employee.id, shift_date: todayStr, clock_in: now },
        { onConflict: 'employee_id,shift_date' },
      )
      .select()
      .single()
    if (error || !data) {
      setToast('Could not clock in — try again')
    } else {
      setRecord(data)
      setToast(`Clocked in at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
    }
    setTimeout(() => setToast(''), 3000)
    setLoading(false)
  }

  async function clockOut() {
    if (!record?.clock_in || record?.clock_out) return
    setLoading(true)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('clock_records')
      .update({ clock_out: now })
      .eq('id', record.id)
      .select()
      .single()
    if (error || !data) {
      setToast('Could not clock out — try again')
    } else {
      setRecord(data)
      const hrs = ((new Date(now) - new Date(record.clock_in)) / 3600000).toFixed(1)
      setToast(`Clocked out — ${hrs} hrs logged`)
    }
    setTimeout(() => setToast(''), 3000)
    setLoading(false)
  }

  const isClockedIn = record?.clock_in && !record?.clock_out
  const clockInTime = record?.clock_in ? new Date(record.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div className="clock-ring">
          <div style={{ fontSize: 12, color: '#6b6b6b' }}>{isClockedIn ? 'Clocked in' : 'Clocked out'}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{isClockedIn ? clockInTime : '--:--'}</div>
        </div>
        <div style={{ marginTop: 18 }}>
          {isClockedIn
            ? <button className="btn-red" style={{ width: '100%' }} onClick={clockOut} disabled={loading}>Clock Out</button>
            : <button className="btn-primary" onClick={clockIn} disabled={loading}>Clock In</button>
          }
        </div>
      </div>

      {toast && <div className="success-box">✓ {toast}</div>}

      <div className="section-label">Today's log</div>
      <div className="card" style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.8 }}>
        {record?.clock_in && <div>Clock in: <strong style={{ color: '#1a1a1a' }}>{new Date(record.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong></div>}
        {record?.clock_out && <div>Clock out: <strong style={{ color: '#1a1a1a' }}>{new Date(record.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong></div>}
        {!record && <div>Not clocked in yet today.</div>}
      </div>
    </div>
  )
}
