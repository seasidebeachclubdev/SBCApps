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
  const [templates, setTemplates] = useState([])
  const [patternDay, setPatternDay] = useState(null)
  const [patternForm, setPatternForm] = useState({ start: '', end: '' })
  const [swaps, setSwaps] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'kitchen' })
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    // top up the coming two weeks from the weekly patterns (idempotent)
    await supabase.rpc('materialize_shifts', { days_ahead: 14 })
    // clock_records and shifts each have two FKs to employees; name the join
    const [{ data }, { data: tpl }, { data: swapRows }] = await Promise.all([
      supabase.from('employees')
        .select('*, clock_records!employee_id(id, clock_in, clock_out, shift_date, override_note, note), shifts!employee_id(id, shift_date, start_time, end_time, area, status)')
        .eq('active', true).order('name'),
      supabase.from('schedule_templates').select('*'),
      supabase.from('shifts')
        .select('*, owner:employees!employee_id(name), claimer:employees!picked_up_by(name)')
        .in('status', ['dropped', 'picked_up'])
        .gte('shift_date', localDateStr())
        .order('shift_date'),
    ])
    setEmployees(data || [])
    setTemplates(tpl || [])
    // needs attention: open drops, and claims not yet approved
    setSwaps((swapRows || []).filter(s => s.status === 'dropped' || !s.approved))
  }

  const today = localDateStr()
  const selected = employees.find(e => e.id === selectedId) || null

  const pastDays = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); pastDays.push(localDateStr(d)) }
  const futureDays = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); futureDays.push(localDateStr(d)) }

  // multiple punches per day are allowed (split shifts)
  const recsFor = (emp, date) => (emp.clock_records || [])
    .filter(r => r.shift_date === date)
    .sort((a, b) => (a.clock_in || '').localeCompare(b.clock_in || ''))
  const openRecFor = (emp, date) => recsFor(emp, date).find(r => r.clock_in && !r.clock_out)
  const shiftFor = (emp, date) => emp.shifts?.find(s => s.shift_date === date)
  const hrs = r => (r?.clock_in && r?.clock_out) ? roundHours((new Date(r.clock_out) - new Date(r.clock_in)) / 3600000) : null
  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const fmtST = t => t ? new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const toInput = ts => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const dayLabel = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // ---------- time clock overrides ----------
  // editDay identifies a specific punch (record id) or a new one for a date
  function startClockEdit(key, rec) {
    setEditDay(key)
    setClockForm({ in: toInput(rec?.clock_in), out: toInput(rec?.clock_out), note: '' })
  }

  async function saveClockEdit(date, rec) {
    if (!clockForm.note.trim()) return flash('A reason is required for time overrides')
    if (clockForm.in && clockForm.out && clockForm.out <= clockForm.in) return flash('Clock-out must be after clock-in')
    setBusy(true)
    const payload = {
      clock_in: clockForm.in ? new Date(`${date}T${clockForm.in}:00`).toISOString() : null,
      clock_out: clockForm.out ? new Date(`${date}T${clockForm.out}:00`).toISOString() : null,
      override_by: admin.id,
      override_note: clockForm.note.trim(),
    }
    const { error } = rec
      ? await supabase.from('clock_records').update(payload).eq('id', rec.id)
      : await supabase.from('clock_records').insert({ employee_id: selected.id, shift_date: date, ...payload })
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
    const payload = { start_time: shiftForm.start, end_time: shiftForm.end, status: 'scheduled' }
    const { error } = shift
      ? await supabase.from('shifts').update(payload).eq('id', shift.id)
      : await supabase.from('shifts').insert({
          employee_id: selected.id,
          shift_date: date,
          area: selected.area,
          ...payload,
        })
    setBusy(false)
    if (error) return flash('Could not save shift — try again')
    setShiftDay(null)
    flash('Shift saved')
    fetchEmployees()
  }

  // "cancelled" (not deleted) so the weekly pattern does not re-create the day
  async function cancelShift(shift) {
    setBusy(true)
    const { error } = await supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not cancel shift' : 'Shift cancelled for that day')
    fetchEmployees()
  }

  // ---------- weekly pattern ----------
  const WEEKDAYS = [
    { d: 1, label: 'Monday' }, { d: 2, label: 'Tuesday' }, { d: 3, label: 'Wednesday' },
    { d: 4, label: 'Thursday' }, { d: 5, label: 'Friday' }, { d: 6, label: 'Saturday' }, { d: 0, label: 'Sunday' },
  ]
  const templateFor = weekday => templates.find(t => t.employee_id === selected?.id && t.weekday === weekday)
  const futureDatesFor = weekday => {
    const out = []
    for (let i = 1; i <= 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); if (d.getDay() === weekday) out.push(localDateStr(d)) }
    return out
  }

  function startPatternEdit(weekday, tpl) {
    setPatternDay(weekday)
    setPatternForm({ start: tpl?.start_time?.slice(0, 5) ?? '09:00', end: tpl?.end_time?.slice(0, 5) ?? '17:00' })
  }

  async function savePattern(weekday) {
    if (!patternForm.start || !patternForm.end) return flash('Start and end times are required')
    if (patternForm.end <= patternForm.start) return flash('End must be after start')
    setBusy(true)
    const { error } = await supabase.from('schedule_templates').upsert({
      employee_id: selected.id,
      weekday,
      start_time: patternForm.start,
      end_time: patternForm.end,
      area: selected.area,
    }, { onConflict: 'employee_id,weekday' })
    if (!error) {
      // upcoming weeks adopt the new pattern; today's shift is left alone
      await supabase.from('shifts').delete()
        .eq('employee_id', selected.id).eq('status', 'scheduled')
        .in('shift_date', futureDatesFor(weekday))
      await supabase.rpc('materialize_shifts', { days_ahead: 14 })
    }
    setBusy(false)
    if (error) return flash('Could not save pattern — try again')
    setPatternDay(null)
    flash('Weekly pattern saved')
    fetchEmployees()
  }

  async function clearPattern(weekday, tpl) {
    setBusy(true)
    const { error } = await supabase.from('schedule_templates').delete().eq('id', tpl.id)
    if (!error) {
      await supabase.from('shifts').delete()
        .eq('employee_id', selected.id).eq('status', 'scheduled')
        .in('shift_date', futureDatesFor(weekday))
    }
    setBusy(false)
    flash(error ? 'Could not update pattern' : 'Weekly pattern cleared')
    fetchEmployees()
  }

  // ---------- dropped shifts & pickup approvals ----------
  async function approvePickup(shift) {
    setBusy(true)
    // the shift transfers to the claimer and returns to the schedule
    const { error } = await supabase.from('shifts').update({
      employee_id: shift.picked_up_by,
      status: 'scheduled',
      approved: true,
      dropped_reason: null,
    }).eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not approve pickup' : `Shift now belongs to ${shift.claimer?.name ?? 'the claimer'}`)
    fetchEmployees()
  }

  async function denyPickup(shift) {
    setBusy(true)
    const { error } = await supabase.from('shifts').update({
      status: 'dropped',
      picked_up_by: null,
      approved: false,
    }).eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not deny pickup' : 'Pickup denied — shift is open again')
    fetchEmployees()
  }

  async function restoreDrop(shift) {
    setBusy(true)
    const { error } = await supabase.from('shifts').update({
      status: 'scheduled',
      dropped_reason: null,
      picked_up_by: null,
      approved: false,
    }).eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not restore shift' : `Shift returned to ${shift.owner?.name ?? 'the employee'}`)
    fetchEmployees()
  }

  async function cancelDroppedDay(shift) {
    setBusy(true)
    const { error } = await supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shift.id)
    setBusy(false)
    flash(error ? 'Could not cancel shift' : 'Shift cancelled — nobody works that slot')
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
    const total = pastDays.reduce((a, d) => a + recsFor(selected, d).reduce((x, r) => x + (hrs(r) ?? 0), 0), 0)

    const clockEditForm = (date, rec) => (
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
        <button className="btn-teal" disabled={busy} onClick={() => saveClockEdit(date, rec)}>
          {busy ? 'Saving…' : 'Save Override'}
        </button>
      </div>
    )
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
                const recs = recsFor(selected, date)
                const dayTotal = recs.reduce((a, r) => a + (hrs(r) ?? 0), 0)
                const addKey = `new-${date}`
                return (
                  <div key={date} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div className="list-item" style={{ borderBottom: 'none', alignItems: 'flex-start' }}>
                      <div style={{ width: 86, flexShrink: 0, fontSize: 12, fontWeight: date === today ? 600 : 500 }}>
                        {dayLabel(date)}
                        {dayTotal > 0 && <div style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 600 }}>{Math.round(dayTotal * 100) / 100} hrs</div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        {recs.length === 0 && <div style={{ fontSize: 12, color: '#6b6b6b' }}>No record</div>}
                        {recs.map(rec => (
                          <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 2 }}>
                            <span style={{ flex: 1 }}>
                              {fmtT(rec.clock_in)} – {fmtT(rec.clock_out)}
                              {rec.override_note && <span title={rec.override_note} style={{ color: '#c98a1b' }}> ✏️</span>}
                            </span>
                            <span style={{ fontWeight: 600 }}>{hrs(rec) != null ? `${hrs(rec)}h` : rec.clock_in ? 'open' : ''}</span>
                            <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => (editDay === rec.id ? setEditDay(null) : startClockEdit(rec.id, rec))}>
                              {editDay === rec.id ? 'Cancel' : 'Edit'}
                            </button>
                          </div>
                        ))}
                        {recs.some(r => r.note) && (
                          <div style={{ fontSize: 11, color: '#2f6e78' }}>📝 {recs.map(r => r.note).filter(Boolean).join(' · ')}</div>
                        )}
                      </div>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 8 }}
                        onClick={() => (editDay === addKey ? setEditDay(null) : startClockEdit(addKey, null))}>
                        {editDay === addKey ? 'Cancel' : recs.length ? '+' : 'Add'}
                      </button>
                    </div>
                    {recs.map(rec => (editDay === rec.id ? <div key={`f-${rec.id}`}>{clockEditForm(date, rec)}</div> : null))}
                    {editDay === addKey && clockEditForm(date, null)}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === 'schedule' && (
          <>
            <div className="section-label">Weekly pattern · repeats every week</div>
            <div className="list-card">
              {WEEKDAYS.map(({ d, label }) => {
                const tpl = templateFor(d)
                const editing = patternDay === d
                return (
                  <div key={d} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div className="list-item" style={{ borderBottom: 'none' }}>
                      <div style={{ width: 86, flexShrink: 0, fontSize: 12, fontWeight: 500 }}>{label}</div>
                      <div style={{ flex: 1, fontSize: 12, color: tpl ? '#1a1a1a' : '#6b6b6b' }}>
                        {tpl ? `${fmtST(tpl.start_time)} – ${fmtST(tpl.end_time)}` : 'Off'}
                      </div>
                      {tpl && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} disabled={busy}
                          onClick={() => clearPattern(d, tpl)}>✕</button>
                      )}
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 6 }}
                        onClick={() => (editing ? setPatternDay(null) : startPatternEdit(d, tpl))}>
                        {editing ? 'Cancel' : tpl ? 'Edit' : 'Set'}
                      </button>
                    </div>
                    {editing && (
                      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div className="fg"><label className="fl">Start</label>
                            <input type="time" value={patternForm.start} onChange={e => setPatternForm({ ...patternForm, start: e.target.value })} /></div>
                          <div className="fg"><label className="fl">End</label>
                            <input type="time" value={patternForm.end} onChange={e => setPatternForm({ ...patternForm, end: e.target.value })} /></div>
                        </div>
                        <button className="btn-teal" disabled={busy} onClick={() => savePattern(d)}>
                          {busy ? 'Saving…' : `Save every ${label}`}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="section-label">Next 14 days · one-off changes</div>
            <div className="card" style={{ fontSize: 12, color: '#6b6b6b' }}>
              Generated from the weekly pattern. Edit or cancel individual days here; shifts appear in the employee's staff app immediately.
            </div>
            <div className="list-card">
              {futureDays.map(date => {
                const shift = shiftFor(selected, date)
                const editing = shiftDay === date
                return (
                  <div key={date} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div className="list-item" style={{ borderBottom: 'none' }}>
                      <div style={{ width: 86, flexShrink: 0, fontSize: 12, fontWeight: date === today ? 600 : 500 }}>{dayLabel(date)}</div>
                      <div style={{ flex: 1, fontSize: 12, color: shift && shift.status !== 'cancelled' ? '#1a1a1a' : '#6b6b6b' }}>
                        {shift
                          ? shift.status === 'cancelled'
                            ? 'Off (cancelled)'
                            : `${fmtST(shift.start_time)} – ${fmtST(shift.end_time)} · ${shift.area}`
                          : 'Off'}
                        {shift?.status === 'dropped' && <span style={{ color: '#c98a1b' }}> · dropped</span>}
                      </div>
                      {shift && shift.status !== 'cancelled' && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} disabled={busy}
                          onClick={() => cancelShift(shift)}>✕</button>
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
  const onDuty = employees.filter(e => openRecFor(e, today))

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      {swaps.length > 0 && (
        <>
          <div className="section-label">Shift swaps needing attention ({swaps.length})</div>
          {swaps.map(s => (
            <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {dayLabel(s.shift_date)} · {fmtST(s.start_time)} – {fmtST(s.end_time)} · {s.area}
                </div>
                <span className={`badge ${s.status === 'dropped' ? 'badge-amber' : 'badge-blue'}`}>
                  {s.status === 'dropped' ? 'Dropped' : 'Claim pending'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                {s.owner?.name}
                {s.dropped_reason ? ` — "${s.dropped_reason}"` : ''}
                {s.status === 'picked_up' && s.claimer && <> · claimed by <strong style={{ color: '#1a1a1a' }}>{s.claimer.name}</strong></>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {s.status === 'picked_up' ? (
                  <>
                    <button className="btn-teal" style={{ flex: 1 }} disabled={busy} onClick={() => approvePickup(s)}>
                      Approve — give to {s.claimer?.name?.split(' ')[0] ?? 'claimer'}
                    </button>
                    <button className="btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => denyPickup(s)}>
                      Deny
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-teal" style={{ flex: 1 }} disabled={busy} onClick={() => restoreDrop(s)}>
                      Return to {s.owner?.name?.split(' ')[0] ?? 'owner'}
                    </button>
                    <button className="btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => cancelDroppedDay(s)}>
                      Cancel shift
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="section-label">On duty now ({onDuty.length})</div>
      {onDuty.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b' }}>Nobody is clocked in.</div>
      ) : (
        <div className="list-card">
          {onDuty.map(emp => (
            <div key={emp.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => { setSelectedId(emp.id); setView('clock') }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{roleLabelOf(emp)} · in {fmtT(openRecFor(emp, today)?.clock_in)}</div>
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
          const isClockedIn = !!openRecFor(emp, today)
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
