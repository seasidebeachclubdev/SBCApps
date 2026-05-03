import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [showOverride, setShowOverride] = useState(false)
  const [overrideForm, setOverrideForm] = useState({ employee_id: '', time: '', note: '' })
  const [toast, setToast] = useState('')

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('*, clock_records(clock_in, clock_out, shift_date)').eq('active', true).order('name')
    setEmployees(data || [])
  }

  const today = new Date().toISOString().slice(0, 10)

  async function submitOverride(e) {
    e.preventDefault()
    const clock_in = new Date(`${today}T${overrideForm.time}`).toISOString()
    await supabase.from('clock_records').upsert({
      employee_id: overrideForm.employee_id,
      shift_date: today,
      clock_in,
      override_note: overrideForm.note,
    })
    setShowOverride(false)
    setOverrideForm({ employee_id: '', time: '', note: '' })
    setToast('Time clock override saved')
    fetchEmployees()
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      {showOverride ? (
        <>
          <div className="section-label">Time Clock Override</div>
          <div className="card">
            <form onSubmit={submitOverride} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fg"><label className="fl">Employee</label>
                <select value={overrideForm.employee_id} onChange={e => setOverrideForm({ ...overrideForm, employee_id: e.target.value })} required>
                  <option value="">Select employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Corrected clock-in time</label><input type="time" value={overrideForm.time} onChange={e => setOverrideForm({ ...overrideForm, time: e.target.value })} required /></div>
              <div className="fg"><label className="fl">Reason</label><input type="text" placeholder="e.g. forgot to clock in" value={overrideForm.note} onChange={e => setOverrideForm({ ...overrideForm, note: e.target.value })} required /></div>
              <button type="submit" className="btn-primary">Save Override</button>
              <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={() => setShowOverride(false)}>Cancel</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="section-label">On duty today</div>
          <div className="list-card">
            {employees.map(emp => {
              const todayRecord = emp.clock_records?.find(r => r.shift_date === today)
              const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out
              return (
                <div key={emp.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      {emp.area}{todayRecord?.clock_in ? ` · In ${new Date(todayRecord.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ' · Not clocked in'}
                    </div>
                  </div>
                  <span className={`badge ${isClockedIn ? 'badge-green' : 'badge-gray'}`}>{isClockedIn ? 'On' : 'Out'}</span>
                </div>
              )
            })}
          </div>
          <div className="card">
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'center' }} onClick={() => setShowOverride(true)}>
              ✏️ Override time clock entry
            </button>
          </div>
        </>
      )}
    </div>
  )
}