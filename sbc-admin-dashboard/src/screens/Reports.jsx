import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

const csvq = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

function HBar({ label, value, max, color = '#50a2ad', suffix = '' }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div style={{ width: 92, color: '#6b6b6b', flexShrink: 0, textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, background: '#f2f2f7', borderRadius: 4, height: 16 }}>
        <div style={{ width: `${pct}%`, background: color, height: 16, borderRadius: 4 }} />
      </div>
      <div style={{ width: 44, fontWeight: 600, flexShrink: 0 }}>{value}{suffix}</div>
    </div>
  )
}

function DayBars({ points }) {
  const max = Math.max(1, ...points.map(p => p.count))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
        {points.map(p => (
          <div key={p.date} title={`${p.date}: ${p.count}`} style={{
            flex: 1,
            height: `${Math.max(4, (p.count / max) * 100)}%`,
            background: p.count ? '#50a2ad' : '#e0e0e0',
            borderRadius: 3,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b6b6b', marginTop: 4 }}>
        <span>{points[0]?.label}</span>
        <span>today</span>
      </div>
    </div>
  )
}

export default function Reports() {
  const [d, setD] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [guests, members, issues, employees, clocks, shifts, claims] = await Promise.all([
      supabase.from('guests').select('fee, paid, payment_method, member_id, guest_name, visit_date, checked_in_by'),
      supabase.from('members').select('member_id, first_name, last_name, membership_type, onboarded, auth_user_id, active'),
      supabase.from('issues').select('status, category, created_at, resolved_at'),
      supabase.from('employees').select('area, active'),
      supabase.from('clock_records').select('clock_in, clock_out, shift_date'),
      supabase.from('shifts').select('status'),
      supabase.from('account_claims').select('status'),
    ]).then(rs => rs.map(r => r.data || []))

    // --- fees
    const billed = guests.reduce((a, g) => a + (g.fee || 35), 0)
    const collected = guests.filter(g => g.paid).reduce((a, g) => a + (g.fee || 35), 0)

    // --- guest activity: check-ins by day, last 14 days
    const days = []
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i)
      const key = localDateStr(dt)
      days.push({
        date: key,
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: guests.filter(g => g.checked_in_by && g.visit_date === key).length,
      })
    }
    const paid = guests.filter(g => g.paid)
    const cash = paid.filter(g => g.payment_method === 'cash').length
    const check = paid.filter(g => g.payment_method === 'check').length

    // --- 4-visit watch: most-visited guests
    const byGuest = {}
    for (const g of guests) {
      const k = (g.guest_name || '').trim().toLowerCase()
      if (!k) continue
      byGuest[k] = byGuest[k] || { name: g.guest_name, visits: 0 }
      byGuest[k].visits++
    }
    const topGuests = Object.values(byGuest).sort((a, b) => b.visits - a.visits).slice(0, 5)

    // --- membership
    const active = members.filter(m => m.active !== false)
    const types = {}
    for (const m of active) types[m.membership_type || 'Unknown'] = (types[m.membership_type || 'Unknown'] || 0) + 1

    // --- issues
    const issueStatus = { Open: 0, 'In Progress': 0, Resolved: 0 }
    const issueCats = {}
    let resSumDays = 0, resCount = 0
    for (const i of issues) {
      issueStatus[i.status] = (issueStatus[i.status] || 0) + 1
      issueCats[i.category] = (issueCats[i.category] || 0) + 1
      if (i.resolved_at) { resSumDays += (new Date(i.resolved_at) - new Date(i.created_at)) / 86400000; resCount++ }
    }

    // --- staffing
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const hours7 = clocks
      .filter(c => c.clock_in && c.clock_out && c.shift_date >= localDateStr(weekAgo))
      .reduce((a, c) => a + (new Date(c.clock_out) - new Date(c.clock_in)) / 3600000, 0)
    const areas = {}
    for (const e of employees.filter(e => e.active)) areas[e.area || 'Other'] = (areas[e.area || 'Other'] || 0) + 1

    // --- per-member fee breakdown (only members with guest activity)
    const memberStats = members.map(m => {
      const mg = guests.filter(g => g.member_id === m.member_id)
      const owed = mg.filter(g => !g.paid).reduce((a, g) => a + (g.fee || 35), 0)
      return { ...m, visits: mg.length, owed }
    })

    setD({
      billed, collected,
      passes: guests.length, checkins: guests.filter(g => g.checked_in_by).length,
      days, cash, check, topGuests,
      members: { total: active.length, onboarded: active.filter(m => m.onboarded).length, withLogin: active.filter(m => m.auth_user_id).length, types },
      claims: { pending: claims.filter(c => c.status === 'pending').length, approved: claims.filter(c => c.status === 'approved').length },
      issues: { status: issueStatus, cats: issueCats, avgDays: resCount ? (resSumDays / resCount) : null },
      staffing: { hours7: Math.round(hours7 * 10) / 10, areas, dropped: shifts.filter(s => s.status === 'dropped').length },
      memberStats,
    })
  }

  function exportCSV() {
    const rows = [
      ['Member ID', 'Name', 'Type', 'Guest Visits', 'Amount Owed', 'Onboarded'],
      ...d.memberStats.map(m => [m.member_id, `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(), m.membership_type, m.visits, m.owed, m.onboarded ? 'yes' : 'no']),
    ]
    const csv = rows.map(r => r.map(csvq).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `SBC_Report_${localDateStr()}.csv`; a.click()
    setToast('Report exported')
    setTimeout(() => setToast(''), 3000)
  }

  if (!d) return <div className="screen"><div className="card" style={{ textAlign: 'center', color: '#6b6b6b', fontSize: 13 }}>Loading analytics…</div></div>

  const rate = d.billed > 0 ? Math.round((d.collected / d.billed) * 100) : 0
  const owing = d.memberStats.filter(m => m.owed > 0).sort((a, b) => b.owed - a.owed)
  const catMax = Math.max(1, ...Object.values(d.issues.cats))
  const typeMax = Math.max(1, ...Object.values(d.members.types))
  const areaMax = Math.max(1, ...Object.values(d.staffing.areas))

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      <div className="section-label">Guest fees</div>
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Billed</div><div className="stat-value" style={{ fontSize: 18 }}>${d.billed}</div></div>
        <div className="stat-card"><div className="stat-label">Collected</div><div className="stat-value" style={{ fontSize: 18, color: '#0f6e56' }}>${d.collected}</div></div>
        <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: '#d64040' }}>${d.billed - d.collected}</div></div>
        <div className="stat-card"><div className="stat-label">Collection rate</div><div className="stat-value">{rate}%</div></div>
      </div>
      {(d.cash + d.check) > 0 && (
        <div className="card" style={{ fontSize: 12, color: '#6b6b6b' }}>
          Payments: {d.cash} cash · {d.check} check
        </div>
      )}

      <div className="section-label">Guest check-ins · last 14 days</div>
      <div className="card">
        <DayBars points={d.days} />
        <div style={{ fontSize: 12, color: '#6b6b6b', marginTop: 8 }}>
          {d.passes} passes issued · {d.checkins} checked in this season
        </div>
      </div>

      {d.topGuests.length > 0 && (
        <>
          <div className="section-label">4-visit watch · most frequent guests</div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.topGuests.map(g => (
              <HBar key={g.name} label={g.name} value={g.visits} max={4}
                color={g.visits >= 4 ? '#d64040' : g.visits === 3 ? '#c98a1b' : '#50a2ad'} suffix="/4" />
            ))}
          </div>
        </>
      )}

      <div className="section-label">Membership</div>
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Active memberships</div><div className="stat-value">{d.members.total}</div></div>
        <div className="stat-card"><div className="stat-label">Portal accounts</div><div className="stat-value">{d.members.withLogin}</div></div>
        <div className="stat-card"><div className="stat-label">Onboarded</div><div className="stat-value">{d.members.onboarded}</div></div>
        <div className="stat-card"><div className="stat-label">Claims pending</div><div className="stat-value" style={{ color: d.claims.pending ? '#c98a1b' : undefined }}>{d.claims.pending}</div></div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(d.members.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <HBar key={t} label={t} value={n} max={typeMax} />
        ))}
      </div>

      <div className="section-label">Issues</div>
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Open</div><div className="stat-value" style={{ color: d.issues.status.Open ? '#d64040' : undefined }}>{d.issues.status.Open || 0}</div></div>
        <div className="stat-card"><div className="stat-label">In progress</div><div className="stat-value">{d.issues.status['In Progress'] || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Resolved</div><div className="stat-value" style={{ color: '#0f6e56' }}>{d.issues.status.Resolved || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Avg days to resolve</div><div className="stat-value">{d.issues.avgDays == null ? '—' : d.issues.avgDays < 1 ? '<1' : Math.round(d.issues.avgDays * 10) / 10}</div></div>
      </div>
      {Object.keys(d.issues.cats).length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(d.issues.cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
            <HBar key={c} label={c} value={n} max={catMax} color="#7a6bb5" />
          ))}
        </div>
      )}

      <div className="section-label">Staffing</div>
      <div className="grid-2">
        <div className="stat-card"><div className="stat-label">Hours · last 7 days</div><div className="stat-value">{d.staffing.hours7}</div></div>
        <div className="stat-card"><div className="stat-label">Dropped shifts open</div><div className="stat-value" style={{ color: d.staffing.dropped ? '#c98a1b' : undefined }}>{d.staffing.dropped}</div></div>
      </div>
      {Object.keys(d.staffing.areas).length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(d.staffing.areas).sort((a, b) => b[1] - a[1]).map(([a, n]) => (
            <HBar key={a} label={a} value={n} max={areaMax} color="#3d8893" />
          ))}
        </div>
      )}

      <div className="section-label">Members owing fees {owing.length ? `(${owing.length})` : ''}</div>
      {owing.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b' }}>No outstanding balances.</div>
      ) : (
        <div className="list-card">
          {owing.map(m => (
            <div key={m.member_id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.member_id} · {m.visits} guest visit{m.visits !== 1 ? 's' : ''}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#d64040' }}>${m.owed}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card"><button className="btn-primary" onClick={exportCSV}>Export Full Report CSV</button></div>
    </div>
  )
}
