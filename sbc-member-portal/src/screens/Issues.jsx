import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Maintenance', 'Safety', 'Cabana', 'Bathroom', 'Facility', 'General']

export default function Issues() {
  const { member } = useAuth()
  const [issues, setIssues] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: '', subject: '', description: '' })
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchIssues() }, [])

  async function fetchIssues() {
    const { data } = await supabase
      .from('issues').select('*')
      .eq('member_id', member.member_id)
      .order('created_at', { ascending: false })
    setIssues(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.category) return
    setSaving(true)
    await supabase.from('issues').insert({
      member_id: member.member_id,
      category: form.category,
      subject: form.subject,
      description: form.description,
      status: 'Open',
    })
    setShowForm(false)
    setForm({ category: '', subject: '', description: '' })
    setToast('Issue reported — management notified')
    fetchIssues()
    setTimeout(() => setToast(''), 3000)
    setSaving(false)
  }

  const statusClass = s => s === 'Open' ? 'badge-amber' : s === 'Resolved' ? 'badge-green' : 'badge-blue'

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      {showForm ? (
        <>
          <div className="section-label">Report an Issue</div>
          <div className="card">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fg">
                <label className="fl">Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Subject</label>
                <input type="text" placeholder="Brief description" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
              </div>
              <div className="fg">
                <label className="fl">Details</label>
                <textarea rows={3} placeholder="Additional details..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit Report'}</button>
              <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={() => setShowForm(false)}>Cancel</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Report an Issue</button>
          </div>
          <div className="section-label">My issues</div>
          {issues.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No issues reported.</div>
          ) : (
            <div className="list-card">
              {issues.map(i => (
                <div key={i.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{i.subject}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{i.category} · {new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </div>
                  <span className={`badge ${statusClass(i.status)}`}>{i.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card" style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.6 }}>
            You'll be notified by email when your issue status changes. Urgent: 401-322-0201.
          </div>
        </>
      )}
    </div>
  )
}
