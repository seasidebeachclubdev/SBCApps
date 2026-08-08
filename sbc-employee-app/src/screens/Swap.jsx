import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'
import Icon from '../components/Icon'

const DROP_REASONS = ['Personal / family', 'Illness', 'Schedule conflict', 'Other']

export default function Swap() {
  const { employee } = useAuth()
  const [openShifts, setOpenShifts] = useState([])
  const [myShifts, setMyShifts] = useState([])   // mine: scheduled / dropped / picked_up
  const [myClaims, setMyClaims] = useState([])   // other people's shifts I claimed
  const [showDropForm, setShowDropForm] = useState(false)
  const [dropShift, setDropShift] = useState(null)
  const [dropReason, setDropReason] = useState('')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  async function fetchData() {
    const today = localDateStr()
    const [{ data: open }, { data: mine }, { data: claims }] = await Promise.all([
      supabase.from('shifts').select('*, employees!employee_id(name, area)')
        .eq('status', 'dropped').neq('employee_id', employee.id)
        .gte('shift_date', today).order('shift_date'),
      supabase.from('shifts').select('*')
        .eq('employee_id', employee.id)
        .in('status', ['scheduled', 'dropped', 'picked_up'])
        .gte('shift_date', today).order('shift_date'),
      supabase.from('shifts').select('*, employees!employee_id(name)')
        .eq('picked_up_by', employee.id).eq('status', 'picked_up')
        .gte('shift_date', today).order('shift_date'),
    ])
    setOpenShifts(open || [])
    setMyShifts(mine || [])
    setMyClaims(claims || [])
  }

  const scheduled = myShifts.filter(s => s.status === 'scheduled')
  const myDrops = myShifts.filter(s => s.status === 'dropped')
  const myCovered = myShifts.filter(s => s.status === 'picked_up') // my drop, someone claimed it

  async function claimShift(shift) {
    if (shift.employee_id === employee.id) return
    // no double-booking: not against my schedule, not against claims I
    // already have pending
    const conflict = [...scheduled, ...myClaims].find(s =>
      s.shift_date === shift.shift_date &&
      s.start_time < shift.end_time && s.end_time > shift.start_time
    )
    if (conflict) {
      flash(`Conflicts with your ${conflict.start_time}–${conflict.end_time} shift that day`)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('shifts')
      .update({ status: 'picked_up', picked_up_by: employee.id })
      .eq('id', shift.id)
    // the database enforces the same rules; surface its message if it fires
    flash(error
      ? (error.message?.includes('time conflict') ? 'Conflicts with a shift you already work that day'
        : error.message?.includes('requires a manager') ? 'Someone else just claimed this shift'
        : 'Could not claim shift — try again')
      : 'Shift claimed — awaiting manager approval')
    fetchData()
    setSaving(false)
  }

  async function withdrawClaim(shift) {
    setSaving(true)
    const { error } = await supabase.from('shifts')
      .update({ status: 'dropped', picked_up_by: null })
      .eq('id', shift.id)
    flash(error ? 'Could not withdraw — try again' : 'Claim withdrawn — the shift is open again')
    fetchData()
    setSaving(false)
  }

  async function submitDrop(e) {
    e.preventDefault()
    if (!dropReason) return
    setSaving(true)
    const { error } = await supabase.from('shifts')
      .update({ status: 'dropped', dropped_reason: dropReason })
      .eq('id', dropShift.id)
    setShowDropForm(false)
    setDropShift(null)
    setDropReason('')
    flash(error ? 'Could not drop shift — try again' : 'Shift dropped — coworkers can claim it now')
    fetchData()
    setSaving(false)
  }

  async function cancelDrop(shift) {
    setSaving(true)
    const { error } = await supabase.from('shifts')
      .update({ status: 'scheduled', dropped_reason: null })
      .eq('id', shift.id)
    flash(error
      ? (error.message?.includes('requires a manager') ? 'Someone already claimed it — ask a manager' : 'Could not undo — try again')
      : 'Drop cancelled — the shift is yours again')
    fetchData()
    setSaving(false)
  }

  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="screen">
      {toast && <div className="success-box"><Icon name="check" size={15} />{toast}</div>}

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
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Drop Shift'}</button>
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
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area} · {s.employees?.name}</div>
                  </div>
                  <button className="btn-teal" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => claimShift(s)} disabled={saving}>Claim</button>
                </div>
              ))}
            </div>
          )}

          {(myClaims.length > 0 || myDrops.length > 0 || myCovered.length > 0) && (
            <>
              <div className="section-label">Pending requests</div>
              <div className="list-card">
                {myClaims.map(s => (
                  <div key={s.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(s.shift_date)}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area} · {s.employees?.name}'s shift</div>
                      <span className="badge badge-amber" style={{ marginTop: 4 }}>Claim awaiting approval</span>
                    </div>
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => withdrawClaim(s)} disabled={saving}>Withdraw</button>
                  </div>
                ))}
                {myDrops.map(s => (
                  <div key={s.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(s.shift_date)}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area}</div>
                      <span className="badge badge-amber" style={{ marginTop: 4 }}>Dropped — open for claims</span>
                    </div>
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => cancelDrop(s)} disabled={saving}>Take Back</button>
                  </div>
                ))}
                {myCovered.map(s => (
                  <div key={s.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt(s.shift_date)}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>{s.start_time}–{s.end_time} · {s.area}</div>
                      <span className="badge badge-blue" style={{ marginTop: 4 }}>A coworker claimed it — awaiting manager</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-label">My upcoming shifts</div>
          {scheduled.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No upcoming shifts.</div>
          ) : (
            <div className="list-card">
              {scheduled.map(s => {
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
            Claims and drops take effect once a manager approves them.
          </div>
        </>
      )}
    </div>
  )
}
