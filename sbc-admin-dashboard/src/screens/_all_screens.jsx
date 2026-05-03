// Members.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Members() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { fetchMembers() }, [])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').order('last_name')
    setMembers(data || [])
  }

  const filtered = members.filter(m =>
    !search ||
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    m.member_id?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="screen">
      <div style={{ padding: '0 16px' }}>
        <input type="text" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="card" style={{ textAlign: 'center', fontSize: 12, color: '#6b6b6b' }}>
        {members.length} total · {members.filter(m => m.onboarded).length} onboarded · {members.filter(m => !m.onboarded).length} pending
      </div>
      <div className="list-card">
        {filtered.map(m => (
          <div key={m.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {m.first_name} {m.last_name}
                {!m.onboarded && <span className="ob-flag" style={{ marginLeft: 8 }}>Pending</span>}
              </div>
              <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.member_id} · {m.membership_type}{m.cabana ? ` · Cabana ${m.cabana}` : ''}</div>
            </div>
            <span className={`badge ${m.active !== false ? 'badge-green' : 'badge-red'}`}>
              {m.active !== false ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Fees.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Fees() {
  const [unpaid, setUnpaid] = useState([])
  const [paid, setPaid] = useState([])
  const [toast, setToast] = useState('')

  useEffect(() => { fetchFees() }, [])

  async function fetchFees() {
    const { data } = await supabase.from('guests').select('*, members!member_id(first_name, last_name)').order('created_at', { ascending: false })
    setUnpaid((data || []).filter(g => !g.paid))
    setPaid((data || []).filter(g => g.paid))
  }

  async function markPaid(id) {
    await supabase.from('guests').update({ paid: true }).eq('id', id)
    setToast('Fee marked as paid')
    fetchFees()
    setTimeout(() => setToast(''), 3000)
  }

  const unpaidTotal = unpaid.reduce((a, g) => a + (g.fee || 35), 0)
  const paidTotal = paid.reduce((a, g) => a + (g.fee || 35), 0)

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ color: '#d64040', fontSize: 20 }}>${unpaidTotal}</div></div>
        <div className="stat-card"><div className="stat-label">Collected</div><div className="stat-value" style={{ color: '#0f6e56', fontSize: 20 }}>${paidTotal}</div></div>
      </div>
      {unpaid.length > 0 && (
        <>
          <div className="section-label">Outstanding</div>
          <div className="list-card">
            {unpaid.map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{g.guest_name}</div>
                  <div style={{ fontSize: 11, color: '#6b6b6b' }}>{g.member_id} · {g.visit_date}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#d64040', marginRight: 10 }}>${g.fee || 35}</span>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => markPaid(g.id)}>Mark paid</button>
              </div>
            ))}
          </div>
        </>
      )}
      {paid.length > 0 && (
        <>
          <div className="section-label">Paid</div>
          <div className="list-card">
            {paid.slice(0, 10).map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{g.guest_name}</div><div style={{ fontSize: 11, color: '#6b6b6b' }}>{g.member_id}</div></div>
                <span className="badge badge-green">Paid</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Employees.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Employees() {
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

// Payroll.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Payroll() {
  const [employees, setEmployees] = useState([])
  const [toast, setToast] = useState('')
  const HOURLY_RATE = 16

  useEffect(() => { fetchPayroll() }, [])

  async function fetchPayroll() {
    const since = new Date()
    since.setDate(since.getDate() - 14)
    const { data } = await supabase
      .from('employees').select('id, name, area, clock_records(clock_in, clock_out, shift_date)')
      .eq('active', true).order('name')
    setEmployees((data || []).map(emp => {
      const hrs = (emp.clock_records || []).reduce((a, r) => {
        if (!r.clock_in || !r.clock_out) return a
        return a + (new Date(r.clock_out) - new Date(r.clock_in)) / 3600000
      }, 0)
      return { ...emp, hours: Math.round(hrs * 10) / 10 }
    }))
  }

  function exportCSV() {
    const rows = [['Name', 'Area', 'Hours', 'Gross Pay'], ...employees.map(e => [e.name, e.area, e.hours, (e.hours * HOURLY_RATE).toFixed(2)])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `SBC_Payroll_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    setToast('CSV exported — ready for QuickBooks')
    setTimeout(() => setToast(''), 3000)
  }

  const totalHrs = employees.reduce((a, e) => a + e.hours, 0)
  const totalPay = employees.reduce((a, e) => a + e.hours * HOURLY_RATE, 0)

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Total hours</div><div className="stat-value">{totalHrs.toFixed(1)}</div></div>
        <div className="stat-card"><div className="stat-label">Est. payroll</div><div className="stat-value" style={{ fontSize: 18 }}>${totalPay.toFixed(0)}</div></div>
      </div>
      <div className="section-label">This pay period</div>
      <div className="list-card">
        {employees.map(emp => (
          <div key={emp.id} className="list-item">
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div><div style={{ fontSize: 11, color: '#6b6b6b' }}>{emp.area}</div></div>
            <div style={{ fontSize: 13, color: '#6b6b6b', marginRight: 10 }}>{emp.hours} hrs</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>${(emp.hours * HOURLY_RATE).toFixed(0)}</div>
          </div>
        ))}
      </div>
      <div className="card"><button className="btn-primary" onClick={exportCSV}>Export CSV for QuickBooks</button></div>
    </div>
  )
}

// Comms.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function Comms() {
  const { admin } = useAuth()
  const [form, setForm] = useState({ recipients: 'all', subject: '', message: '' })
  const [notices, setNotices] = useState([])
  const [toast, setToast] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(5).then(({ data }) => setNotices(data || []))
  }, [])

  async function sendMessage(e) {
    e.preventDefault()
    setSending(true)
    await supabase.functions.invoke('send-member-email', {
      body: { recipients: form.recipients, subject: form.subject, message: form.message, sent_by: admin.name }
    })
    // Also save as notice if it's a broadcast
    if (form.recipients === 'all') {
      await supabase.from('notices').insert({ text: form.message, posted_by: admin.id, active: true })
    }
    setForm({ recipients: 'all', subject: '', message: '' })
    setToast('Message sent to members')
    setTimeout(() => setToast(''), 3000)
    setSending(false)
  }

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="section-label">Send to members</div>
      <div className="card">
        <form onSubmit={sendMessage} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="fg"><label className="fl">Recipients</label>
            <select value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })}>
              <option value="all">All active members</option>
              <option value="family">Family memberships only</option>
              <option value="unpaid">Members with unpaid fees</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Subject</label><input type="text" placeholder="e.g. Beach closure notice" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required /></div>
          <div className="fg"><label className="fl">Message</label><textarea rows={4} placeholder="Type your message..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required /></div>
          <button type="submit" className="btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send Email'}</button>
        </form>
      </div>
      {notices.length > 0 && (
        <>
          <div className="section-label">Recent notices</div>
          <div className="list-card">
            {notices.map(n => (
              <div key={n.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{n.text.slice(0, 60)}{n.text.length > 60 ? '…' : ''}</div>
                  <div style={{ fontSize: 11, color: '#6b6b6b' }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span className="badge badge-green">Sent</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Issues.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Issues() {
  const [issues, setIssues] = useState([])
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchIssues() }, [])

  async function fetchIssues() {
    const { data } = await supabase.from('issues').select('*, members!member_id(first_name, last_name)').order('created_at', { ascending: false })
    setIssues(data || [])
  }

  async function resolveIssue(id) {
    await supabase.from('issues').update({ status: 'Resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    await supabase.functions.invoke('send-issue-resolved-email', { body: { issue_id: id } })
    setToast('Issue resolved — member notified')
    fetchIssues()
    setTimeout(() => setToast(''), 3000)
  }

  const filtered = issues.filter(i => filter === 'all' || i.status === filter)
  const statusClass = s => s === 'Open' ? 'badge-amber' : s === 'Resolved' ? 'badge-green' : 'badge-blue'

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="filter-bar">
        {['all', 'Open', 'In Progress', 'Resolved'].map(f => (
          <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${issues.length})` : f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No issues.</div>
      ) : (
        <div className="list-card">
          {filtered.map(i => (
            <div key={i.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{i.subject}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{i.category} · {i.members ? `${i.members.first_name} ${i.members.last_name}` : i.member_id} · {new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`badge ${statusClass(i.status)}`}>{i.status}</span>
                {i.status !== 'Resolved' && (
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => resolveIssue(i.id)}>Resolve</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Reports.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Reports() {
  const [data, setData] = useState({ billed: 0, collected: 0, outstanding: 0, members: [] })
  const [toast, setToast] = useState('')

  useEffect(() => { fetchReports() }, [])

  async function fetchReports() {
    const { data: guests } = await supabase.from('guests').select('fee, paid, member_id, guest_name, visit_date')
    const { data: members } = await supabase.from('members').select('member_id, first_name, last_name')
    const billed = (guests || []).reduce((a, g) => a + (g.fee || 35), 0)
    const collected = (guests || []).filter(g => g.paid).reduce((a, g) => a + (g.fee || 35), 0)
    const memberStats = (members || []).map(m => {
      const mg = (guests || []).filter(g => g.member_id === m.member_id)
      const owed = mg.filter(g => !g.paid).reduce((a, g) => a + (g.fee || 35), 0)
      return { ...m, visits: mg.length, owed }
    })
    setData({ billed, collected, outstanding: billed - collected, members: memberStats })
  }

  function exportCSV() {
    const rows = [['Member ID', 'Name', 'Visits', 'Amount Owed'], ...data.members.map(m => [m.member_id, `${m.first_name} ${m.last_name}`, m.visits, m.owed])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `SBC_Report_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    setToast('Report exported')
    setTimeout(() => setToast(''), 3000)
  }

  const rate = data.billed > 0 ? Math.round((data.collected / data.billed) * 100) : 0

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Fees billed</div><div className="stat-value" style={{ fontSize: 18 }}>${data.billed}</div></div>
        <div className="stat-card"><div className="stat-label">Collected</div><div className="stat-value" style={{ fontSize: 18, color: '#0f6e56' }}>${data.collected}</div></div>
        <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: '#d64040' }}>${data.outstanding}</div></div>
        <div className="stat-card"><div className="stat-label">Collection rate</div><div className="stat-value">{rate}%</div></div>
      </div>
      <div className="section-label">Per-member breakdown</div>
      <div className="list-card">
        {data.members.map(m => (
          <div key={m.member_id} className="list-item">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.visits} guest visit{m.visits !== 1 ? 's' : ''}</div>
            </div>
            {m.owed > 0
              ? <span style={{ fontSize: 13, fontWeight: 600, color: '#d64040' }}>${m.owed}</span>
              : <span className="badge badge-green">Paid</span>
            }
          </div>
        ))}
      </div>
      <div className="card"><button className="btn-primary" onClick={exportCSV}>Export Full Report CSV</button></div>
    </div>
  )
}
