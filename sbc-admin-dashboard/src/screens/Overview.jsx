import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { localDateStr } from '../lib/dates'

const FLAGS = {
  green:  { color: '#2e9e55', bg: '#eaf7ee', border: '#8dd4a8', text: '#1a5c33', label: 'Green',  desc: 'Safe conditions' },
  yellow: { color: '#d4a017', bg: '#fdf8e6', border: '#f0d060', text: '#7a5500', label: 'Yellow', desc: 'Caution' },
  red:    { color: '#d63c3c', bg: '#fdeaea', border: '#f09595', text: '#7a1a1a', label: 'Red',    desc: 'No swimming' },
  purple: { color: '#8a3ab9', bg: '#f3eaf9', border: '#c89ae0', text: '#4a1a70', label: 'Purple', desc: 'Marine life' },
}

const FLAG_ROW_ID = '00000000-0000-0000-0000-000000000001'

export default function Overview() {
  const { admin } = useAuth()
  const [stats, setStats] = useState({ checkedIn: 0, guests: 0, collected: 0, outstanding: 0 })
  const [recentCheckins, setRecentCheckins] = useState([])
  const [pendingOnboarding, setPendingOnboarding] = useState([])
  const [openIssues, setOpenIssues] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [currentFlag, setCurrentFlag] = useState('green')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const today = localDateStr()

    // Stats
    const { count: checkedIn } = await supabase.from('guests').select('id', { count: 'exact' }).eq('visit_date', today).not('checked_in_by', 'is', null)
    const { data: guestsToday } = await supabase.from('guests').select('id').eq('visit_date', today)
    const { data: fees } = await supabase.from('guests').select('fee, paid')
    const collected = (fees || []).filter(f => f.paid).reduce((a, f) => a + (f.fee || 35), 0)
    const outstanding = (fees || []).filter(f => !f.paid).reduce((a, f) => a + (f.fee || 35), 0)
    const unpaid = (fees || []).filter(f => !f.paid).length
    setStats({ checkedIn: checkedIn || 0, guests: guestsToday?.length || 0, collected, outstanding })
    setUnpaidCount(unpaid)

    // Recent check-ins
    const { data: checkins } = await supabase.from('guests').select('guest_name, member_name, visit_date, checked_in_by').eq('visit_date', today).not('checked_in_by', 'is', null).order('created_at', { ascending: false }).limit(4)
    setRecentCheckins(checkins || [])

    // Pending onboarding
    const { data: pending } = await supabase.from('members').select('first_name, last_name, member_id').eq('onboarded', false).limit(5)
    setPendingOnboarding(pending || [])

    // Open issues
    const { count: issCount } = await supabase.from('issues').select('id', { count: 'exact' }).eq('status', 'Open')
    setOpenIssues(issCount || 0)

    // Current flag
    const { data: flag } = await supabase.from('beach_flag').select('color').eq('id', FLAG_ROW_ID).single()
    if (flag?.color) setCurrentFlag(flag.color)
  }

  async function setFlag(color) {
    await supabase.from('beach_flag').upsert({ id: FLAG_ROW_ID, color, set_by: admin.id, updated_at: new Date().toISOString() })
    setCurrentFlag(color)
    setToast(`Flag updated — members now see ${FLAGS[color].label} flag`)
    setTimeout(() => setToast(''), 3000)
  }

  const cur = FLAGS[currentFlag] || FLAGS.green

  return (
    <div className="screen">
      {(openIssues > 0 || unpaidCount > 0 || pendingOnboarding.length > 0) && (
        <div className="alert-box">
          ⚠️ {[
            openIssues > 0 && `${openIssues} open issue${openIssues !== 1 ? 's' : ''}`,
            unpaidCount > 0 && `${unpaidCount} unpaid fee${unpaidCount !== 1 ? 's' : ''}`,
            pendingOnboarding.length > 0 && `${pendingOnboarding.length} pending onboarding`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Beach flag control */}
      <div className="section-label">Beach flag</div>
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 10 }}>Tap to update — changes appear instantly on the member portal.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(FLAGS).map(([key, f]) => (
            <button
              key={key}
              className={`flag-btn ${currentFlag === key ? 'active' : ''}`}
              style={{ background: f.bg, borderColor: currentFlag === key ? f.color : 'transparent' }}
              onClick={() => setFlag(key)}
            >
              <div className="flag-swatch" style={{ background: f.color }} />
              <div className="flag-lbl" style={{ color: f.text }}>{f.label}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ width: 14, height: 10, background: cur.color, borderRadius: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 12, fontWeight: 500 }}>{cur.label} — {cur.desc}</div>
        </div>
      </div>

      {toast && <div className="success-box">✓ {toast}</div>}

      {/* Stats */}
      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-label">Checked in today</div>
          <div className="stat-value">{stats.checkedIn}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Guests today</div>
          <div className="stat-value">{stats.guests}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fees collected</div>
          <div className="stat-value" style={{ fontSize: 18 }}>${stats.collected.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#6b6b6b' }}>this season</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value" style={{ fontSize: 18, color: '#d64040' }}>${stats.outstanding.toLocaleString()}</div>
        </div>
      </div>

      {/* Recent check-ins */}
      <div className="section-label">Recent check-ins</div>
      {recentCheckins.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No check-ins yet today.</div>
      ) : (
        <div className="list-card">
          {recentCheckins.map((c, i) => (
            <div key={i} className="list-item">
              <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: '#b5d4f4', color: '#0c447c' }}>
                {c.guest_name?.split(' ').map(w => w[0]).join('') || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.guest_name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>Guest of {c.member_name}</div>
              </div>
              <span className="badge badge-green">In</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending onboarding */}
      {pendingOnboarding.length > 0 && (
        <>
          <div className="section-label">Pending onboarding</div>
          <div className="list-card">
            {pendingOnboarding.map(m => (
              <div key={m.member_id} className="list-item">
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                <span className="ob-flag">Needs review</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
