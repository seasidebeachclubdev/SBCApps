import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { GUEST_FEE_TEXT, CAR_FEE_TEXT } from '../lib/fees'

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

  const fmtDate = d => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Date TBD'
  const detail = g => [
    g.age_group === 'child' ? 'under 18' : '18+',
    g.own_car ? 'own car' : null,
  ].filter(Boolean).join(' · ')

  // only passes the member said they would cover count against their balance
  const mine = unpaid.filter(g => g.paid_by !== 'guest')
  const guestPays = unpaid.filter(g => g.paid_by === 'guest')
  const total = mine.reduce((a, g) => a + (g.fee || 0), 0)
  const guestTotal = guestPays.reduce((a, g) => a + (g.fee || 0), 0)
  const paidTotal = paid.reduce((a, g) => a + (g.fee || 0), 0)

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

      {mine.length > 0 && (
        <>
          <div className="section-label">Outstanding — you pay</div>
          <div className="list-card">
            {mine.map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{g.guest_name} — {fmtDate(g.visit_date)}</div>
                  <div style={{ fontSize: 12, color: '#6b6b6b' }}>${g.fee} · {detail(g)}</div>
                </div>
                <span className="badge badge-amber">Due</span>
              </div>
            ))}
          </div>
        </>
      )}

      {guestPays.length > 0 && (
        <>
          <div className="section-label">Guest pays at the gate (${guestTotal})</div>
          <div className="list-card">
            {guestPays.map(g => (
              <div key={g.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{g.guest_name} — {fmtDate(g.visit_date)}</div>
                  <div style={{ fontSize: 12, color: '#6b6b6b' }}>${g.fee} · {detail(g)}</div>
                </div>
                <span className="badge badge-blue">Guest</span>
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
                  <div style={{ fontSize: 14, color: '#1a1a1a' }}>{g.guest_name} — {fmtDate(g.visit_date)}</div>
                  <div style={{ fontSize: 12, color: '#6b6b6b' }}>${g.fee}</div>
                </div>
                <span className="badge badge-green">Paid</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Policy</div>
      <div className="card" style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.7 }}>
        {GUEST_FEE_TEXT}. Guests arriving in their own car also pay a car fee: {CAR_FEE_TEXT}.
        Same guest max 4 visits/season across all members.
        <br /><br />
        All fees are collected in person by a gate attendant — cash or check only. All outstanding fees must be paid by the Sunday of Labor Day weekend. Late fees will be applied to all balances remaining after that date.
        <br /><br />
        Questions? Call <strong>401-322-0201</strong> or email{' '}
        <a href="mailto:seasidebeachclub@gmail.com" style={{ color: 'inherit' }}>seasidebeachclub@gmail.com</a>.
      </div>
    </div>
  )
}
