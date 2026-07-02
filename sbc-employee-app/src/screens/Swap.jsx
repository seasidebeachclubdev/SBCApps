import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

const DROP_REASONS = ['Personal / family', 'Illness', 'Schedule conflict', 'Other']

export default function Swap() {
  const { employee } = useAuth()
  const [openShifts, setOpenShifts] = useState([])
  const [myShifts, setMyShifts] = useState([])
  const [showDropForm, setShowDropForm] = useState(false)
  const [dropShift, setDropShift] = useState(null)
  const [dropReason, setDropReason] = useState('')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const today = localDateStr()
    // exclude the employee's own dropped shifts - you can't claim your own
    const { data: open } = await supabase
      .from('shifts').select('*, employees(name, area)')
      .eq('status', 'dropped').neq('employee_id', employee.id)
      .gte('shift_date', today).order('shift_date')
    setOpenShifts(open || [])

    const { data: mine } = await supabase
      .from('shifts').select('*')
      .eq('employee_id', employee.id)
      .in('status', ['scheduled', 'picked_up'])
      .gte('shift_date', today).order('shift_date')
    setMyShifts(mine || [])
  }

  async function claimShift(shift) {
    if (shift.employee_id === employee.id) return
    setSaving(true)
    const { error } = await supabase.from('shifts').update({ status: 'picked_up', picked_up_by: employee.id, approved: false }).eq('id', shift.id)
    setToast(error ? 'Could not claim shift — try again' : 'Shift claimed — awaiting manager approval')
    fetchData()
    setTimeout(() => setToast(''), 3000)
    setSaving(false)
  }

  async function submitDrop(e) {
    e.preventDefault()
    if (!dropReason) return
    setSaving(true)
    await supabase.from('shifts').update({ status: 'dropped', dropped_reason: dropReason, approved: false }).eq('id', dropShift.id)
    setShowDropForm(false)
    setDropShift(null)
    setDropReason('')
    setToast('Drop request sent — awaiting manager approval')
    fetchData()
    setTimeout(() => setToast(''), 3000)
    setSaving(false)
  }

  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      {showDropForm ? (
        <>
          <div className="section-label">Drop a shift</div>
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{fmt(dropShift.shift_date)} · {dropShift.start_time}–{dropShift.end_time}</div>
            <form onSubmit={submitDrop} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fg">
                <label className="fl">Reason for dropping</label>
                <select value={dropReason} onChange={e => setDropReason(e.target.value)} required>
                  <option value="">Select reason...</option>
                  {DROP_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit Drop Request'}</button>
              <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={() => { setShowDropForm(false); setDropShift(null) }}>Cancel</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="section-label">Open shifts</div>
          {openShifts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No open shifts available.</div>
          ) : (
            <div className="list-card">
              {openShifts.map(s => (
                <div key={s.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(s.shift_date)}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area}</div>
                  </div>
                  <button className="btn-teal" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => claimShift(s)} disabled={saving}>Claim</button>
                </div>
              ))}
            </div>
          )}

          <div className="section-label">My upcoming shifts</div>
          {myShifts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No upcoming shifts.</div>
          ) : (
            <div className="list-card">
              {myShifts.map(s => {
                const isToday = s.shift_date === localDateStr()
                return (
                  <div key={s.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(s.shift_date)}{isToday ? ' (today)' : ''}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area}</div>
                    </div>
                    {isToday
                      ? <span className="badge badge-green">Today</span>
                      : <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setDropShift(s); setShowDropForm(true) }}>Drop</button>
                    }
                  </div>
                )
              })}
            </div>
          )}
          <div className="card" style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.6 }}>
            All drop/swap requests require manager approval. You'll be notified by SMS.
          </div>
        </>
      )}
    </div>
  )
}
