import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Reports() {
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