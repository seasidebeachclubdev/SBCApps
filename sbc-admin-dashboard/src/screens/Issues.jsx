import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Issues() {
  const [issues, setIssues] = useState([])
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchIssues() }, [])

  async function fetchIssues() {
    const { data } = await supabase.from('issues').select('*, members!member_id(first_name, last_name)').order('created_at', { ascending: false })
    setIssues(data || [])
  }

  async function resolveIssue(id) {
    const { error } = await supabase.from('issues').update({ status: 'Resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setToast('Could not resolve issue — try again')
      setTimeout(() => setToast(''), 3000)
      return
    }
    const { error: mailError } = await supabase.functions.invoke('send-issue-resolved-email', { body: { issue_id: id } })
    setToast(mailError ? 'Issue resolved — email notification failed' : 'Issue resolved — member notified')
    fetchIssues()
    setTimeout(() => setToast(''), 3000)
  }

  const filtered = issues.filter(i => filter === 'all' || i.status === filter)
  const statusClass = s => s === 'Open' ? 'badge-amber' : s === 'Resolved' ? 'badge-green' : 'badge-blue'

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
          {filtered.map(i => (
            <div key={i.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{i.subject}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{i.category} · {i.members ? `${i.members.first_name} ${i.members.last_name}` : i.member_id} · {new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`badge ${statusClass(i.status)}`}>{i.status}</span>
                {i.status !== 'Resolved' && (
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => resolveIssue(i.id)}>Resolve</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}