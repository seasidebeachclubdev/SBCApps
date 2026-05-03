// Events.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Events() {
  const [notices, setNotices] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    supabase.from('notices').select('*').eq('active', true).order('created_at', { ascending: false }).then(({ data }) => setNotices(data || []))
    supabase.from('events').select('*').eq('active', true).order('event_date').then(({ data }) => setEvents(data || []))
  }, [])

  return (
    <div className="screen">
      {notices.length > 0 && (
        <>
          <div className="section-label">Notices</div>
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
      <div className="section-label">Season calendar</div>
      {events.map(ev => (
        <div key={ev.id} className="event-card">
          <div className="event-date-box">
            <div className="event-month">{new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</div>
            <div className="event-day">{new Date(ev.event_date + 'T00:00:00').getDate()}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{ev.title}</div>
            <div style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.5 }}>{ev.description}</div>
          </div>
        </div>
      ))}
      <div className="card" style={{ textAlign: 'center', fontSize: 12, color: '#6b6b6b' }}>
        Season: June 20 – Labor Day (Sep 1)
      </div>
    </div>
  )
}

// Issues.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Maintenance', 'Safety', 'Cabana', 'Bathroom', 'Facility', 'General']

export function Issues() {
  const { member } = useAuth()
  const [issues, setIssues] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: '', subject: '', description: '' })
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchIssues() }, [])

  async function fetchIssues() {
    const { data } = await supabase
      .from('issues')
      .select('*')
      .eq('member_id', member.member_id)
      .order('created_at', { ascending: false })
    setIssues(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.category) return
    setSaving(true)
    const { error } = await supabase.from('issues').insert({
      member_id: member.member_id,
      category: form.category,
      subject: form.subject,
      description: form.description,
      status: 'Open',
    })
    if (!error) {
      setShowForm(false)
      setForm({ category: '', subject: '', description: '' })
      setToast('Issue reported — management notified')
      fetchIssues()
      setTimeout(() => setToast(''), 3000)
    }
    setSaving(false)
  }

  const statusBadge = s => s === 'Open' ? 'badge-amber' : s === 'Resolved' ? 'badge-green' : 'badge-blue'

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
                  <span className={`badge ${statusBadge(i.status)}`}>{i.status}</span>
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

// Rules.jsx — static content, no DB needed
const RULES = [
  { id: 'hours', title: 'Facilities & Hours', items: [
    { text: 'Season: June 20 – Labor Day' },
    { text: 'Lifeguards: 9:30 AM – 5:00 PM daily' },
    { text: 'Beach after 5:00 PM at your own risk' },
    { text: 'Snack bar hours vary by weather' },
    { text: 'Cabana decks reserved for cabana patrons only' },
    { text: 'No overnight sleeping · No cooking in cabanas' },
  ]},
  { id: 'guests', title: 'Guests', items: [
    { text: 'All guests must be checked in under a member\'s name' },
    { text: 'Guests must check in immediately at the gate upon arrival — including guests in your vehicle', hi: true },
    { text: 'Failure to check in guests will result in revocation of membership', hi: true },
    { text: 'Same guest: max 4 visits/season across all members' },
    { text: 'Visitors from adjacent beaches must sign in and pay guest fees' },
    { text: 'Valid photo ID required for all guests' },
  ]},
  { id: 'beach', title: 'Beach Rules', items: [
    { text: 'No glass on the beach' },
    { text: 'No radios — headphones only' },
    { text: 'No surfboards 9 AM – 6 PM' },
    { text: 'Fins, masks, floats in designated areas only' },
    { text: 'Ball/Frisbee in designated areas only' },
    { text: 'No fireworks' },
    { text: 'No fire/grilling except designated area, 5–9 PM' },
    { text: 'No tents or pop-ups — umbrellas only' },
    { text: 'No dogs or pets' },
    { text: 'No picnicking on beach — outside food in picnic area only' },
    { text: 'No smoking on property' },
  ]},
  { id: 'parking', title: 'Parking & Stickers', items: [
    { text: 'Family: max 2 stickers · Single: 1 sticker' },
    { text: 'Stickers not transferable' },
    { text: 'Park where directed by attendants' },
    { text: 'Vehicles without a sticker will be charged the standard parking fee' },
    { text: 'Vehicles without a sticker will be charged $200 to park on July 3–5 and September 5–7', hi: true },
  ]},
  { id: 'membership', title: 'Membership', items: [
    { text: 'All fees due by May 1 or membership cancelled' },
    { text: 'All outstanding guest fees must be paid by the Sunday of Labor Day weekend — late fees applied to all remaining balances after that date' },
    { text: 'Memberships, cabanas, bathhouses not transferable' },
    { text: 'No sharing cabanas without management approval' },
    { text: 'Children\'s parties after 6 PM require approval' },
    { text: 'Misrepresentation voids membership' },
    { text: 'Management may refuse or dismiss any member or guest' },
  ]},
]

export function Rules() {
  const [open, setOpen] = useState({})
  const toggle = id => setOpen(o => ({ ...o, [id]: o[id] === false ? true : false }))

  return (
    <div className="screen">
      <div className="warn-box">
        ⚠️ All members and guests are responsible for knowing and following these rules.
      </div>
      {RULES.map(sec => {
        const isOpen = open[sec.id] !== false
        return (
          <div key={sec.id} className="rule-section">
            <div className="rule-header" onClick={() => toggle(sec.id)}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{sec.title}</span>
              <span style={{ fontSize: 12, color: '#6b6b6b' }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            <div className={`rule-body ${isOpen ? 'open' : ''}`}>
              {sec.items.map((item, i) => (
                <div key={i} className="rule-item">
                  <div className="rule-dot" style={{ background: item.hi ? '#a32d2d' : '#50a2ad' }} />
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: item.hi ? '#a32d2d' : '#1a1a1a', fontWeight: item.hi ? 500 : 400 }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="card" style={{ textAlign: 'center', fontSize: 12, color: '#6b6b6b' }}>
        Questions? 401-322-0201.
      </div>
    </div>
  )
}
