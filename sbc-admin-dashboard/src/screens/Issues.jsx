import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Issues() {
  const [issues, setIssues] = useState([])
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState('')
  const [openId, setOpenId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchIssues() }, [])

  async function fetchIssues() {
    const { data } = await supabase.from('issues').select('*, members!member_id(first_name, last_name)').order('created_at', { ascending: false })
    setIssues(data || [])
  }

  function toggleOpen(id) {
    setOpenId(o => (o === id ? null : id))
    setNote('')
  }

  async function markInProgress(issue) {
    setBusy(true)
    const { error } = await supabase.from('issues').update({ status: 'In Progress' }).eq('id', issue.id)
    if (error) setToast('Could not update issue — try again')
    else setToast('Marked in progress')
    setBusy(false)
    fetchIssues()
    setTimeout(() => setToast(''), 3000)
  }

  async function resolveIssue(issue) {
    setBusy(true)
    const { error } = await supabase.from('issues').update({ status: 'Resolved', resolved_at: new Date().toISOString() }).eq('id', issue.id)
    if (error) {
      setToast('Could not resolve issue — try again')
      setBusy(false)
      setTimeout(() => setToast(''), 3000)
      return
    }
    const { error: mailError } = await supabase.functions.invoke('send-issue-resolved-email', {
      body: { issue_id: issue.id, note: note.trim() || undefined },
    })
    setToast(mailError ? 'Issue resolved — email notification failed' : 'Issue resolved — member notified')
    setBusy(false)
    setOpenId(null)
    setNote('')
    fetchIssues()
    setTimeout(() => setToast(''), 3000)
  }

  const filtered = issues.filter(i => filter === 'all' || i.status === filter)
  const statusClass = s => s === 'Open' ? 'badge-amber' : s === 'Resolved' ? 'badge-green' : 'badge-blue'
  const fmtDate = d => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

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
          {filtered.map(i => {
            const isOpen = openId === i.id
            return (
              <div key={i.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <div className="list-item" style={{ alignItems: 'flex-start', cursor: 'pointer', borderBottom: 'none' }} onClick={() => toggleOpen(i.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{i.subject}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      {i.category} · {i.members ? `${i.members.first_name} ${i.members.last_name}` : i.member_id} · {fmtDate(i.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${statusClass(i.status)}`}>{i.status}</span>
                    <span style={{ fontSize: 11, color: '#6b6b6b' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, background: '#f2f2f7', borderRadius: 8, padding: '10px 12px' }}>
                      {i.description?.trim() || <span style={{ color: '#6b6b6b' }}>No details provided.</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      Reported {fmtDate(i.created_at)} by {i.members ? `${i.members.first_name} ${i.members.last_name}` : i.member_id} ({i.member_id})
                      {i.resolved_at ? ` · Resolved ${fmtDate(i.resolved_at)}` : ''}
                    </div>
                    {i.status !== 'Resolved' && (
                      <>
                        <textarea
                          rows={2}
                          placeholder="Optional note to the member (included in the resolution email)"
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          style={{ resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          {i.status === 'Open' && (
                            <button className="btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => markInProgress(i)}>
                              Mark In Progress
                            </button>
                          )}
                          <button className="btn-teal" style={{ flex: 2 }} disabled={busy} onClick={() => resolveIssue(i)}>
                            {busy ? 'Working…' : 'Resolve & Notify Member'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
