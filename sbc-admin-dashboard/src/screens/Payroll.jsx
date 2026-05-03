import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Payroll() {
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