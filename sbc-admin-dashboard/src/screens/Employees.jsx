import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { localDateStr, roundHours } from '../lib/dates'

const HOURLY_RATE = 16

// Simplified staffing roles; each maps onto the underlying role/area pair
const ROLE_OPTIONS = [
  { key: 'manager',  label: 'Manager',          role: 'ops_manager',      area: 'Manager' },
  { key: 'business', label: 'Business Manager', role: 'business_manager', area: 'Manager' },
  { key: 'kitchen',  label: 'Kitchen',          role: 'employee',         area: 'Kitchen' },
  { key: 'gate',     label: 'Gate',             role: 'gate_device',      area: 'Gate' },
  { key: 'labor',    label: 'Labor',            role: 'employee',         area: 'Labor' },
]
const roleKeyOf = emp =>
  emp.role === 'business_manager' ? 'business'
  : emp.role === 'ops_manager' ? 'manager'
  : emp.role === 'gate_device' ? 'gate'
  : emp.area === 'Kitchen' ? 'kitchen' : 'labor'
const roleLabelOf = emp => ROLE_OPTIONS.find(o => o.key === roleKeyOf(emp))?.label ?? emp.role

export default function Employees() {
  const { admin } = useAuth()
  const [employees, setEmployees] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('clock') // detail: 'clock' | 'schedule'
  const [editDay, setEditDay] = useState(null)
  const [clockForm, setClockForm] = useState({ in: '', out: '', note: '' })
  const [shiftDay, setShiftDay] = useState(null)
  const [shiftForm, setShiftForm] = useState({ start: '', end: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'kitchen' })
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    // clock_records and shifts each have two FKs to employees; name the join
    const { data } = await supabase.from('employees')
      .select('*, clock_records!employee_id(id, clock_in, clock_out, shift_date, override_note, note), shifts!employee_id(id, shift_date, start_time, end_time, area, status)')
      .eq('active', true).order('name')
    setEmployees(data || [])
  }

  const today = localDateStr()
  const selected = employees.find(e => e.id === selectedId) || null

  const pastDays = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); pastDays.push(localDateStr(d)) }
  const futureDays = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); futureDays.push(localDateStr(d)) }

  const recFor = (emp, date) => emp.clock_records?.find(r => r.shift_date === date)
  const shiftFor = (emp, date) => emp.shifts?.find(s => s.shift_date === date)
  const hrs = r => (r?.clock_in && r?.clock_out) ? roundHours((new Date(r.clock_out) - new Date(r.clock_in)) / 3600000) : null
  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const fmtST = t => t ? new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const toInput = ts => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const dayLabel = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // ---------- time clock overrides ----------
  function startClockEdit(date, rec) {
    setEditDay(date)
    setClockForm({ in: toInput(rec?.clock_in), out: toInput(rec?.clock_out), note: '' })
  }

  async function saveClockEdit(date) {
    if (!clockForm.note.trim()) return flash('A reason is required for time overrides')
    if (clockForm.in && clockForm.out && clockForm.out <= clockForm.in) return flash('Clock-out must be after clock-in')
    setBusy(true)
    const { error } = await supabase.from('clock_records').upsert({
      employee_id: selected.id,
      shift_date: date,
      clock_in: clockForm.in ? new Date(`${date}T${clockForm.in}:00`).toISOString() : null,
      clock_out: clockForm.out ? new Date(`${date}T${clockForm.out}:00`).toISOString() : null,
      override_by: admin.id,
      override_note: clockForm.note.trim(),
    }, { onConflict: 'employee_id,shift_date' })
    setBusy(false)
    if (error) return flash('Could not save override — try again')
    setEditDay(null)
    flash('Time clock updated')
    fetchEmployees()
  }

  // ---------- schedule ----------
  function startShiftEdit(date, shift) {
    setShiftDay(date)
    setShiftForm({ start: shift?.start_time?.slice(0, 5) ?? '', end: shift?.end_time?.slice(0, 5) ?? '' })
  }

  async function saveShift(date, shift) {
    if (!shiftForm.start || !shiftForm.end) return flash('Start and end times are required')
    if (shiftForm.end <= shiftForm.start) return flash('End must be after start')
    setBusy(true)
    const payload = { start_time: shiftForm.start, end_time: shiftForm.end }
    const { error } = shift
      ? await supabase.from('shifts').update(payload).eq('id', shift.id)
      : await supabase.from('shifts').insert({
          employee_id: selected.id,
          shift_date: date,
          area: selected.area,
          status: 'scheduled',
          ...payload,
        })
    setBusy(false)
    if (error) return flash('Could not save shift — try again')
    setShiftDay(null)
    flash('Shift saved')
    fetchEmployees()
  }

  async function deleteShift(shift) {
    setBusy(true)
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not remove shift' : 'Shift removed')
    fetchEmployees()
  }

  // ---------- role + add employee ----------
  async function changeRole(emp, key) {
    const opt = ROLE_OPTIONS.find(o => o.key === key)
    if (!opt) return
    const { error } = await supabase.from('employees').update({ role: opt.role, area: opt.area }).eq('id', emp.id)
    flash(error ? 'Could not change role' : `Role changed to ${opt.label}`)
    fetchEmployees()
  }

  async function addEmployee(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('add-employee', { body: addForm })
    setBusy(false)
    if (error || data?.error) return flash(`Could not add: ${data?.error ?? 'try again'}`)
    flash(data.invite_sent ? 'Employee added — set-password email sent' : 'Employee added — but the email failed')
    setShowAdd(false)
    setAddForm({ name: '', email: '', role: 'kitchen' })
    fetchEmployees()
  }

  // ================= detail =================
  if (selected) {
    const total = pastDays.reduce((a, d) => a + (hrs(recFor(selected, d)) ?? 0), 0)
    return (
      <div className="screen">
        {toast && <div className="success-box">✓ {toast}</div>}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => { setSelectedId(null); setEditDay(null); setShiftDay(null) }}>‹ Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>{selected.email}</div>
          </div>
          <select
            value={roleKeyOf(selected)}
            onChange={e => changeRole(selected, e.target.value)}
            style={{ width: 'auto', fontSize: 12, padding: '6px 8px' }}
          >
            {ROLE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        <div className="filter-bar">
          <button className={`filter-btn ${view === 'clock' ? 'active' : ''}`} onClick={() => setView('clock')}>Time clock</button>
          <button className={`filter-btn ${view === 'schedule' ? 'active' : ''}`} onClick={() => setView('schedule')}>Schedule</button>
        </div>

        {view === 'clock' && (
          <>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#6b6b6b' }}>Last 14 days · rounded to 15 min</span>
              <strong>{total} hrs · ≈ ${Math.round(total * HOURLY_RATE)}</strong>
            </div>
            <div className="list-card">
              {pastDays.map(date => {
                const rec = recFor(selected, date)
                const h = hrs(rec)
                const editing = editDay === date
                return (
                  <div key={date} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div className="list-item" style={{ borderBottom: 'none' }}>
                      <div style={{ width: 86, flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: date === today ? 600 : 500 }}>{dayLabel(date)}</div>
                        {rec?.override_note && <div style={{ fontSize: 10, color: '#c98a1b' }}>✏️ adjusted</div>}
                      </div>
                      <div style={{ flex: 1, fontSize: 12, color: rec ? '#1a1a1a' : '#6b6b6b' }}>
                        {rec ? `${fmtT(rec.clock_in)} – ${fmtT(rec.clock_out)}` : 'No record'}
                        {rec?.note && <div style={{ fontSize: 11, color: '#2f6e78' }}>📝 {rec.note}</div>}
                      </div>
                      <div style={{ width: 52, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                        {h != null ? `${h} hrs` : rec?.clock_in ? 'open' : ''}
                      </div>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 8 }}
                        onClick={() => (editing ? setEditDay(null) : startClockEdit(date, rec))}>
                        {editing ? 'Cancel' : rec ? 'Edit' : 'Add'}
                      </button>
                    </div>
                    {editing && (
                      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div className="fg"><label className="fl">Clock in</label>
                            <input type="time" value={clockForm.in} onChange={e => setClockForm({ ...clockForm, in: e.target.value })} /></div>
                          <div className="fg"><label className="fl">Clock out</label>
                            <input type="time" value={clockForm.out} onChange={e => setClockForm({ ...clockForm, out: e.target.value })} /></div>
                        </div>
                        <div className="fg"><label className="fl">Reason (required, kept on record)</label>
                          <input type="text" placeholder="e.g. forgot to clock out" value={clockForm.note} onChange={e => setClockForm({ ...clockForm, note: e.target.value })} /></div>
                        {rec?.override_note && <div style={{ fontSize: 11, color: '#6b6b6b' }}>Last adjustment: {rec.override_note}</div>}
                        <button className="btn-teal" disabled={busy} onClick={() => saveClockEdit(date)}>
                          {busy ? 'Saving…' : 'Save Override'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === 'schedule' && (
          <>
            <div className="card" style={{ fontSize: 12, color: '#6b6b6b' }}>
              Next 14 days. Shifts appear in the employee's staff app immediately.
            </div>
            <div className="list-card">
              {futureDays.map(date => {
                const shift = shiftFor(selected, date)
                const editing = shiftDay === date
                return (
                  <div key={date} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div className="list-item" style={{ borderBottom: 'none' }}>
                      <div style={{ width: 86, flexShrink: 0, fontSize: 12, fontWeight: date === today ? 600 : 500 }}>{dayLabel(date)}</div>
                      <div style={{ flex: 1, fontSize: 12, color: shift ? '#1a1a1a' : '#6b6b6b' }}>
                        {shift ? `${fmtST(shift.start_time)} – ${fmtST(shift.end_time)} · ${shift.area}` : 'Off'}
                        {shift?.status === 'dropped' && <span style={{ color: '#c98a1b' }}> · dropped</span>}
                      </div>
                      {shift && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} disabled={busy}
                          onClick={() => deleteShift(shift)}>✕</button>
                      )}
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 6 }}
                        onClick={() => (editing ? setShiftDay(null) : startShiftEdit(date, shift))}>
                        {editing ? 'Cancel' : shift ? 'Edit' : 'Add'}
                      </button>
                    </div>
                    {editing && (
                      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div className="fg"><label className="fl">Start</label>
                            <input type="time" value={shiftForm.start} onChange={e => setShiftForm({ ...shiftForm, start: e.target.value })} /></div>
                          <div className="fg"><label className="fl">End</label>
                            <input type="time" value={shiftForm.end} onChange={e => setShiftForm({ ...shiftForm, end: e.target.value })} /></div>
                        </div>
                        <button className="btn-teal" disabled={busy} onClick={() => saveShift(date, shift)}>
                          {busy ? 'Saving…' : 'Save Shift'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // ================= list =================
  const onDuty = employees.filter(e => { const r = recFor(e, today); return r?.clock_in && !r?.clock_out })

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      <div className="section-label">On duty now ({onDuty.length})</div>
      {onDuty.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b' }}>Nobody is clocked in.</div>
      ) : (
        <div className="list-card">
          {onDuty.map(emp => (
            <div key={emp.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => { setSelectedId(emp.id); setView('clock') }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{roleLabelOf(emp)} · in {fmtT(recFor(emp, today)?.clock_in)}</div>
              </div>
              <span className="badge badge-green">On</span>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <>
          <div className="section-label">Add employee</div>
          <div className="card">
            <form onSubmit={addEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fg"><label className="fl">Full name</label>
                <input type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} required /></div>
              <div className="fg"><label className="fl">Email</label>
                <input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} required /></div>
              <div className="fg"><label className="fl">Role</label>
                <select value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                  <option value="manager">Manager</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="gate">Gate</option>
                  <option value="labor">Labor</option>
                </select></div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                They'll get an email to set their password. Managers and gate staff land on the admin dashboard; kitchen and labor on the staff app.
              </div>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add & Send Invite'}</button>
              <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </form>
          </div>
        </>
      ) : (
        <div className="card">
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Employee</button>
        </div>
      )}

      <div className="section-label">All staff · tap for hours &amp; schedule</div>
      <div className="list-card">
        {employees.map(emp => {
          const todayRecord = recFor(emp, today)
          const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out
          return (
            <div key={emp.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => { setSelectedId(emp.id); setView('clock') }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{roleLabelOf(emp)}</div>
              </div>
              <span className={`badge ${isClockedIn ? 'badge-green' : 'badge-gray'}`}>{isClockedIn ? 'On' : 'Out'}</span>
              <span style={{ fontSize: 12, color: '#6b6b6b', marginLeft: 8 }}>›</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
