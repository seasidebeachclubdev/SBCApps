// Clock.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr, roundHours } from '../lib/dates'

export default function Clock() {
  const { employee } = useAuth()
  const [record, setRecord] = useState(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [tick, setTick] = useState(0)

  const todayStr = localDateStr()

  useEffect(() => { fetchRecord() }, [])
  // keep the elapsed display live while clocked in
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  async function fetchRecord() {
    const { data } = await supabase
      .from('clock_records')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('shift_date', todayStr)
      .maybeSingle()
    setRecord(data || null)
    setNote(data?.note ?? '')
  }

  async function saveNote() {
    if (!record) return
    const { error } = await supabase
      .from('clock_records')
      .update({ note: note.trim() || null })
      .eq('id', record.id)
    setNoteSaved(!error)
    setToast(error ? 'Could not save note — try again' : 'Note saved for your manager')
    setTimeout(() => { setToast(''); setNoteSaved(false) }, 3000)
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
      const hrs = roundHours((new Date(now) - new Date(record.clock_in)) / 3600000)
      setToast(`Clocked out — ${hrs} hrs logged (rounded to 15 min)`)
    }
    setTimeout(() => setToast(''), 3000)
    setLoading(false)
  }

  const isClockedIn = record?.clock_in && !record?.clock_out
  const clockInTime = record?.clock_in ? new Date(record.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
  const elapsedMin = isClockedIn ? Math.max(0, Math.round((Date.now() - new Date(record.clock_in)) / 60000)) : 0
  const elapsedLabel = `${Math.floor(elapsedMin / 60)}h ${String(elapsedMin % 60).padStart(2, '0')}m`
  void tick // re-render driver for the live elapsed display

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div className="clock-ring">
          <div style={{ fontSize: 12, color: '#6b6b6b' }}>{isClockedIn ? `In since ${clockInTime}` : 'Clocked out'}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{isClockedIn ? elapsedLabel : '--:--'}</div>
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
        {record?.clock_in && record?.clock_out && (
          <div>Hours: <strong style={{ color: '#1a1a1a' }}>{roundHours((new Date(record.clock_out) - new Date(record.clock_in)) / 3600000)}</strong> <span style={{ fontSize: 11 }}>(rounded to 15 min)</span></div>
        )}
        {!record && <div>Not clocked in yet today.</div>}
      </div>

      {record && (
        <>
          <div className="section-label">Shift note</div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              rows={2}
              placeholder="Anything your manager should know about this shift (visible to managers)"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <button className="btn-secondary" style={{ textAlign: 'center' }} onClick={saveNote}>
              {noteSaved ? '✓ Saved' : 'Save Note'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
