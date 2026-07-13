import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function ClaimCard({ claim, memberLabel, onReview, busy }) {
  const [manualId, setManualId] = useState('')
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {claim.first_name ? `${claim.first_name} ` : ''}{claim.last_name}
        </div>
        <span className={`badge ${claim.member_id ? 'badge-green' : 'badge-amber'}`}>
          {claim.member_id ? `Matched ${claim.member_id}` : 'No match'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.6 }}>
        Plate {claim.license_plate} · {claim.email}{claim.phone ? ` · ${claim.phone}` : ''}
        {memberLabel && <div>Roster: {memberLabel}</div>}
      </div>
      {!claim.member_id && (
        <input
          type="text"
          placeholder="Member ID to attach (e.g. SBC-042)"
          value={manualId}
          onChange={e => setManualId(e.target.value)}
          style={{ fontSize: 13 }}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-teal"
          style={{ flex: 1 }}
          disabled={busy || (!claim.member_id && !manualId.trim())}
          onClick={() => onReview(claim, 'approve', manualId.trim() || undefined)}
        >
          Approve & Send Invite
        </button>
        <button
          className="btn-secondary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => onReview(claim, 'reject')}
        >
          Reject
        </button>
      </div>
    </div>
  )
}

export default function Members() {
  const [members, setMembers] = useState([])
  const [claims, setClaims] = useState([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchMembers(); fetchClaims() }, [])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').order('last_name')
    setMembers(data || [])
  }

  async function fetchClaims() {
    const { data } = await supabase
      .from('account_claims').select('*')
      .eq('status', 'pending')
      .order('created_at')
    setClaims(data || [])
  }

  async function reviewClaim(claim, action, manualMemberId) {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('approve-claim', {
      body: { claim_id: claim.id, action, member_id: manualMemberId },
    })
    if (error || data?.error) {
      setToast(`Could not ${action}: ${data?.error ?? 'try again'}`)
    } else if (action === 'approve') {
      setToast(data?.invite_sent ? 'Approved — invite email sent' : 'Approved — but invite email failed, use Resend later')
    } else {
      setToast('Claim rejected')
    }
    setBusy(false)
    fetchClaims()
    fetchMembers()
    setTimeout(() => setToast(''), 4000)
  }

  const memberLabel = (id) => {
    const m = members.find(x => x.member_id === id)
    return m ? `${m.first_name} ${m.last_name} · ${m.membership_type}` : null
  }

  const filtered = members.filter(m =>
    !search ||
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    m.member_id?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      {claims.length > 0 && (
        <>
          <div className="section-label">Account claims awaiting review ({claims.length})</div>
          {claims.map(c => (
            <ClaimCard key={c.id} claim={c} memberLabel={memberLabel(c.member_id)} onReview={reviewClaim} busy={busy} />
          ))}
        </>
      )}

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
