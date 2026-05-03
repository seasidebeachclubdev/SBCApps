import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Fees() {
  const { member } = useAuth()
  const [unpaid, setUnpaid] = useState([])
  const [paid, setPaid] = useState([])

  useEffect(() => { fetchFees() }, [])

  async function fetchFees() {
    const { data } = await supabase
      .from('guests')
      .select('*')
      .eq('member_id', member.member_id)
      .order('created_at', { ascending: false })

    setUnpaid((data || []).filter(g => !g.paid))
    setPaid((data || []).filter(g => g.paid))
  }

  const total = unpaid.reduce((a, g) => a + (g.fee || 35), 0)
  const paidTotal = paid.reduce((a, g) => a + (g.fee || 35), 0)

  return (
    <div className="screen">
      {total > 0 ? (
        <div className="alert-box">
          ⚠️ ${total} outstanding. All fees must be paid by the Sunday of Labor Day weekend. Late fees will be applied to all balances remaining after that date. See a gate attendant to pay by cash or check.
        </div>
      ) : (
        <div className="success-box">All fees paid — you're good to go! ✓</div>
      )}

      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-label">Total due</div>
          <div className="stat-value" style={{ color: total > 0 ? '#d64040' : '#0f6e56' }}>${total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Paid to date</div>
          <div className="stat-value" style={{ color: '#0f6e56' }}>${paidTotal}</div>
        </div>
      </div>

      {unpaid.length > 0 && (
        <>
          <div className="section-label">Outstanding</div>
          <div className="list-card">
            {unpaid.map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{g.guest_name} — {g.visit_date ? new Date(g.visit_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date TBD'}</div>
                  <div style={{ fontSize: 12, color: '#6b6b6b' }}>${g.fee || 35} guest fee</div>
                </div>
                <span className="badge badge-amber">Due</span>
              </div>
            ))}
          </div>
        </>
      )}

      {paid.length > 0 && (
        <>
          <div className="section-label">Paid</div>
          <div className="list-card">
            {paid.map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: '#1a1a1a' }}>{g.guest_name} — {g.visit_date ? new Date(g.visit_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date TBD'}</div>
                  <div style={{ fontSize: 12, color: '#6b6b6b' }}>${g.fee || 35}</div>
                </div>
                <span className="badge badge-green">Paid</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Policy</div>
      <div className="card" style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.7 }}>
        $35 per guest visit. Same guest max 4 visits/season across all members.
        <br /><br />
        All fees are collected in person by a gate attendant — cash or check only. All outstanding fees must be paid by the Sunday of Labor Day weekend. Late fees will be applied to all balances remaining after that date.
        <br /><br />
        Questions? Call <strong>401-322-0201</strong>.
      </div>
    </div>
  )
}
