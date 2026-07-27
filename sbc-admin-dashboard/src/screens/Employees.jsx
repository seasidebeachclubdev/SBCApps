import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { localDateStr } from '../lib/dates'

const HOURLY_RATE = 16

export default function Employees() {
  const { admin } = useAuth()
  const [employees, setEmployees] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editDay, setEditDay] = useState(null)
  const [form, setForm] = useState({ in: '', out: '', note: '' })
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    // clock_records has two FKs to employees (employee_id + override_by);
    // the join must name which one, or PostgREST rejects it as ambiguous
    const { data } = await supabase.from('employees')
      .select('*, clock_records!employee_id(id, clock_in, clock_out, shift_date, override_note)')
      .eq('active', true).order('name')
    setEmployees(data || [])
  }

  const today = localDateStr()
  const selected = employees.find(e => e.id === selectedId) || null

  // pay period = last 14 days, newest first
  const periodDays = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); periodDays.push(localDateStr(d)) }

  const recFor = (emp, date) => emp.clock_records?.find(r => r.shift_date === date)
  const hrs = r => (r?.clock_in && r?.clock_out) ? (new Date(r.clock_out) - new Date(r.clock_in)) / 3600000 : null
  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
  const toInput = ts => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const dayLabel = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  function startEdit(date, rec) {
    setEditDay(date)
    setForm({ in: toInput(rec?.clock_in), out: toInput(rec?.clock_out), note: '' })
  }

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function saveEdit(date) {
    if (!form.note.trim()) return flash('A reason is required for time overrides')
    if (form.in && form.out && form.out <= form.in) return flash('Clock-out must be after clock-in')
    setBusy(true)
    const { error } = await supabase.from('clock_records').upsert({
      employee_id: selected.id,
      shift_date: date,
      clock_in: form.in ? new Date(`${date}T${form.in}:00`).toISOString() : null,
      clock_out: form.out ? new Date(`${date}T${form.out}:00`).toISOString() : null,
      override_by: admin.id,
      override_note: form.note.trim(),
    }, { onConflict: 'employee_id,shift_date' })
    setBusy(false)
    if (error) return flash('Could not save override — try again')
    setEditDay(null)
    flash('Time clock updated')
    fetchEmployees()
  }

  // ---------- detail: one employee's pay period ----------
  if (selected) {
    const total = periodDays.reduce((a, d) => a + (hrs(recFor(selected, d)) ?? 0), 0)
    return (
      <div className="screen">
        {toast && <div className="success-box">✓ {toast}</div>}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => { setSelectedId(null); setEditDay(null) }}>‹ Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>{selected.area} · last 14 days</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{Math.round(total * 10) / 10} hrs</div>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>≈ ${Math.round(total * HOURLY_RATE)}</div>
          </div>
        </div>

        <div className="list-card">
          {periodDays.map(date => {
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
                  </div>
                  <div style={{ width: 52, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                    {h != null ? `${Math.round(h * 10) / 10} hrs` : rec?.clock_in ? 'open' : ''}
                  </div>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 8 }}
                    onClick={() => (editing ? setEditDay(null) : startEdit(date, rec))}>
                    {editing ? 'Cancel' : rec ? 'Edit' : 'Add'}
                  </button>
                </div>
                {editing && (
                  <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div className="fg"><label className="fl">Clock in</label>
                        <input type="time" value={form.in} onChange={e => setForm({ ...form, in: e.target.value })} /></div>
                      <div className="fg"><label className="fl">Clock out</label>
                        <input type="time" value={form.out} onChange={e => setForm({ ...form, out: e.target.value })} /></div>
                    </div>
                    <div className="fg"><label className="fl">Reason (required, kept on record)</label>
                      <input type="text" placeholder="e.g. forgot to clock out" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
                    {rec?.override_note && (
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>Last adjustment: {rec.override_note}</div>
                    )}
                    <button className="btn-teal" disabled={busy} onClick={() => saveEdit(date)}>
                      {busy ? 'Saving…' : 'Save Override'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- list: everyone, tap to open ----------
  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="section-label">Staff · tap for pay period &amp; time edits</div>
      <div className="list-card">
        {employees.map(emp => {
          const todayRecord = recFor(emp, today)
          const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out
          return (
            <div key={emp.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedId(emp.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                  {emp.area}{todayRecord?.clock_in ? ` · In ${fmtT(todayRecord.clock_in)}` : ' · Not clocked in'}
                </div>
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
