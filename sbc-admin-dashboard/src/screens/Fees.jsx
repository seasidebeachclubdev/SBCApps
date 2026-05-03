import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Fees() {
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