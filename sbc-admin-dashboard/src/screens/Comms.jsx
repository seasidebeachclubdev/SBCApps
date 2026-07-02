import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Comms() {
  const { admin } = useAuth()
  const [form, setForm] = useState({ recipients: 'all', subject: '', message: '' })
  const [notices, setNotices] = useState([])
  const [toast, setToast] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(5).then(({ data }) => setNotices(data || []))
  }, [])

  async function sendMessage(e) {
    e.preventDefault()
    setSending(true)
    const { data, error } = await supabase.functions.invoke('send-member-email', {
      body: { recipients: form.recipients, subject: form.subject, message: form.message, sent_by: admin.name }
    })
    if (error || data?.ok === false) {
      setToast(data?.failed ? `Sent ${data.sent}, failed ${data.failed} — try again` : 'Send failed — try again')
      setTimeout(() => setToast(''), 5000)
      setSending(false)
      return
    }
    // Also save as notice if it's a broadcast
    if (form.recipients === 'all') {
      await supabase.from('notices').insert({ text: form.message, posted_by: admin.id, active: true })
    }
    setForm({ recipients: 'all', subject: '', message: '' })
    setToast(`Message sent to ${data?.sent ?? 0} members`)
    setTimeout(() => setToast(''), 3000)
    setSending(false)
  }

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}
      <div className="section-label">Send to members</div>
      <div className="card">
        <form onSubmit={sendMessage} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="fg"><label className="fl">Recipients</label>
            <select value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })}>
              <option value="all">All active members</option>
              <option value="family">Family memberships only</option>
              <option value="unpaid">Members with unpaid fees</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Subject</label><input type="text" placeholder="e.g. Beach closure notice" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required /></div>
          <div className="fg"><label className="fl">Message</label><textarea rows={4} placeholder="Type your message..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required /></div>
          <button type="submit" className="btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send Email'}</button>
        </form>
      </div>
      {notices.length > 0 && (
        <>
          <div className="section-label">Recent notices</div>
          <div className="list-card">
            {notices.map(n => (
              <div key={n.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{n.text.slice(0, 60)}{n.text.length > 60 ? '…' : ''}</div>
                  <div style={{ fontSize: 11, color: '#6b6b6b' }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span className="badge badge-green">Sent</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}