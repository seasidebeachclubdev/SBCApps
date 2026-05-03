import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import TideCard from '../components/TideCard'
import FlagBanner from '../components/FlagBanner'

export default function Home() {
  const { member } = useAuth()
  const [unpaidFees, setUnpaidFees] = useState(0)
  const [notices, setNotices] = useState([])

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: guests } = await supabase
      .from('guests')
      .select('fee, paid')
      .eq('member_id', member.member_id)
      .eq('paid', false)
    setUnpaidFees(guests?.reduce((a, g) => a + (g.fee || 35), 0) || 0)

    const { data: noticeData } = await supabase
      .from('notices')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    setNotices(noticeData || [])
  }

  const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`

  return (
    <div className="screen">
      {/* Member card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar" style={{ width: 46, height: 46, fontSize: 16, background: '#b5d4f4', color: '#0c447c' }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{member.first_name} {member.last_name}</div>
          <div style={{ fontSize: 12, color: '#6b6b6b' }}>
            {member.member_id} · {member.membership_type}{member.cabana ? ` · Cabana ${member.cabana}` : ''}
          </div>
        </div>
      </div>

      {/* Tide + weather */}
      <TideCard />

      {/* Beach flag */}
      <FlagBanner />

      {/* Outstanding fees alert */}
      {unpaidFees > 0 && (
        <div className="alert-box">
          ⚠️ You have ${unpaidFees} in outstanding guest fees. All outstanding fees must be paid by the Sunday of Labor Day weekend. Late fees will be applied to all balances remaining after that date. See a gate attendant to pay by cash or check.
        </div>
      )}

      {/* Parking warning — always visible */}
      <div className="warn-box">
        🚗 <strong>Parking notice:</strong> Vehicles without a club sticker will be charged <strong>$200</strong> to park on July 3–5 and September 5–7. Ensure your sticker is properly displayed on those dates.
      </div>

      {/* Quick actions */}
      <div className="section-label" style={{ marginTop: 4 }}>Quick actions</div>
      <div className="card" style={{ display: 'flex', gap: 10 }}>
        <button className="btn-teal" style={{ flex: 1 }} onClick={() => window.location.href = '/guests'}>
          + Invite Guest
        </button>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => window.location.href = '/fees'}>
          View Fees
        </button>
      </div>

      {/* Club notices */}
      {notices.length > 0 && (
        <>
          <div className="section-label">Club notices</div>
          {notices.map(n => (
            <div key={n.id} className={`notice-card ${n.urgent ? 'urgent' : ''}`}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{n.text}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 4 }}>
                {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Club info */}
      <div className="section-label">Club info</div>
      <div className="card" style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.9 }}>
        <div>📍 651 Atlantic Ave, Misquamicut RI 02891</div>
        <div>📞 401-322-0201</div>
        <div>🏊 Lifeguards: 9:30 AM – 5:00 PM daily</div>
        <div>📅 Season: June 20 – Labor Day</div>
        <div style={{ color: '#1a1a1a' }}>👥 Guests: $35/visit · Same guest max 4/season</div>
      </div>
    </div>
  )
}
