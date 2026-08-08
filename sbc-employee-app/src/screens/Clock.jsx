// Clock.jsx - supports multiple punches per day (split shifts).
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr, roundHours } from '../lib/dates'
import Icon from '../components/Icon'

export default function Clock() {
  const { employee } = useAuth()
  const [records, setRecords] = useState([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [tick, setTick] = useState(0)

  const todayStr = localDateStr()

  useEffect(() => { fetchRecords() }, [])
  // keep the elapsed display live while clocked in
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const openRecord = records.find(r => r.clock_in && !r.clock_out)
  const latest = records[records.length - 1]

  async function fetchRecords() {
    const { data } = await supabase
      .from('clock_records')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('shift_date', todayStr)
      .order('clock_in', { ascending: true })
    setRecords(data || [])
    setNote(data?.[data.length - 1]?.note ?? '')
  }

  async function saveNote() {
    if (!latest) return
    const { error } = await supabase
      .from('clock_records')
      .update({ note: note.trim() || null })
      .eq('id', latest.id)
    setNoteSaved(!error)
    setToast(error ? 'Could not save note — try again' : 'Note saved for your manager')
    setTimeout(() => { setToast(''); setNoteSaved(false) }, 3000)
  }

  async function clockIn() {
    if (openRecord) return
    setLoading(true)
    const now = new Date().toISOString()
    // plain insert: a partial unique index allows any number of completed
    // punches per day but only one open punch at a time
    const { error } = await supabase
      .from('clock_records')
      .insert({ employee_id: employee.id, shift_date: todayStr, clock_in: now })
    if (error) {
      setToast('Could not clock in — try again')
    } else {
      setToast(`Clocked in at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
    }
    await fetchRecords()
    setTimeout(() => setToast(''), 3000)
    setLoading(false)
  }

  async function clockOut() {
    if (!openRecord) return
    setLoading(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('clock_records')
      .update({ clock_out: now })
      .eq('id', openRecord.id)
    if (error) {
      setToast('Could not clock out — try again')
    } else {
      const hrs = roundHours((new Date(now) - new Date(openRecord.clock_in)) / 3600000)
      setToast(`Clocked out — ${hrs} hrs logged (rounded to 15 min)`)
    }
    await fetchRecords()
    setTimeout(() => setToast(''), 3000)
    setLoading(false)
  }

  const isClockedIn = !!openRecord
  const clockInTime = openRecord ? new Date(openRecord.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
  const elapsedMin = isClockedIn ? Math.max(0, Math.round((Date.now() - new Date(openRecord.clock_in)) / 60000)) : 0
  const elapsedLabel = `${Math.floor(elapsedMin / 60)}h ${String(elapsedMin % 60).padStart(2, '0')}m`
  void tick // re-render driver for the live elapsed display

  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const punchHours = r => (r.clock_in && r.clock_out) ? roundHours((new Date(r.clock_out) - new Date(r.clock_in)) / 3600000) : null
  const totalToday = records.reduce((a, r) => a + (punchHours(r) ?? 0), 0)

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
            : <button className="btn-primary" onClick={clockIn} disabled={loading}>{records.length ? 'Clock In Again' : 'Clock In'}</button>
          }
        </div>
      </div>

      {toast && <div className="success-box"><Icon name="check" size={15} />{toast}</div>}

      <div className="section-label">Today's log</div>
      <div className="card" style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.8 }}>
        {records.length === 0 && <div>Not clocked in yet today.</div>}
        {records.map((r, i) => (
          <div key={r.id}>
            {records.length > 1 ? `Shift ${i + 1}: ` : ''}
            <strong style={{ color: '#1a1a1a' }}>{fmtT(r.clock_in)}</strong>
            {' – '}
            <strong style={{ color: '#1a1a1a' }}>{r.clock_out ? fmtT(r.clock_out) : 'now'}</strong>
            {punchHours(r) != null && <span> · {punchHours(r)} hrs</span>}
          </div>
        ))}
        {records.length > 0 && (
          <div style={{ marginTop: 4 }}>
            Total: <strong style={{ color: '#1a1a1a' }}>{Math.round(totalToday * 100) / 100} hrs</strong>{' '}
            <span style={{ fontSize: 11 }}>(each shift rounded to 15 min)</span>
          </div>
        )}
      </div>

      {records.length > 0 && (
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
              {noteSaved ? 'Saved' : 'Save Note'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
