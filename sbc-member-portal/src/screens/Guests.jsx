import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Guests() {
  const { member } = useAuth()
  const [guests, setGuests] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', date: '' })
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchGuests() }, [])

  async function fetchGuests() {
    const { data } = await supabase
      .from('guests')
      .select('*')
      .eq('member_id', member.member_id)
      .order('created_at', { ascending: false })
    setGuests(data || [])
  }

  async function checkGuestVisits(name, email, phone) {
    // Cross-member 4-visit check. RLS hides other members' guests from this
    // client, so the count runs through a security-definer RPC instead of a
    // direct query. Returns null when the check itself fails.
    const { data: count, error } = await supabase.rpc('guest_visit_count', {
      p_name: name, p_email: email || '', p_phone: phone || '',
    })
    if (error) return null
    return count ?? 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const visits = await checkGuestVisits(form.name, form.email, form.phone)
    if (visits === null) {
      setError('Could not verify guest visit count. Please try again.')
      setSaving(false)
      return
    }
    if (visits >= 4) {
      setError(`${form.name} has already used all 4 guest visits this season and cannot be invited again.`)
      setSaving(false)
      return
    }

    const { data: newGuest, error: insertError } = await supabase.from('guests').insert({
      member_id: member.member_id,
      member_name: `${member.first_name} ${member.last_name}`,
      guest_name: form.name,
      email: form.email,
      phone: form.phone,
      visit_date: form.date || null,
      fee: 35,
      paid: false,
      payment_method: 'cash',
    }).select('id').single()

    if (insertError) {
      setError('Something went wrong. Please try again.')
    } else {
      // Trigger QR email via Supabase Edge Function
      await supabase.functions.invoke('send-guest-qr', {
        body: {
          guest_id: newGuest.id,
          guest_name: form.name,
          guest_email: form.email,
          member_name: `${member.first_name} ${member.last_name}`,
          member_email: member.email,
          visit_date: form.date,
          member_id: member.member_id,
        }
      })
      setShowForm(false)
      setForm({ name: '', email: '', phone: '', date: '' })
      setToast(`QR pass sent to you and ${form.name}`)
      fetchGuests()
      setTimeout(() => setToast(''), 3000)
    }
    setSaving(false)
  }

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      {showForm ? (
        <>
          <div className="section-label">New Guest Pass</div>
          <div className="card">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fg">
                <label className="fl">Guest full name</label>
                <input type="text" placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="fg">
                <label className="fl">Guest email</label>
                <input type="email" placeholder="guest@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="fg">
                <label className="fl">Guest phone</label>
                <input type="tel" placeholder="(401) 555-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="fg">
                <label className="fl">Visit date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="warn-box" style={{ margin: 0 }}>
                Guests must check in at the gate immediately upon arrival, including guests in your vehicle. Failure to do so may result in revocation of membership.
              </div>
              <div className="info-box">
                A QR code will be emailed to you and your guest. The $35 fee is collected by a gate attendant (cash or check). The same guest may not visit more than 4 times per season across all members.
              </div>
              {error && <div className="error-text" style={{ textAlign: 'left' }}>{error}</div>}
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Sending…' : 'Send QR Pass'}
              </button>
              <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={() => { setShowForm(false); setError('') }}>
                Cancel
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 10, lineHeight: 1.5 }}>
              Invite as many guests as you'd like. The same guest may not visit more than 4 times per season across all members.
            </div>
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Invite a Guest</button>
          </div>

          <div className="section-label">Guest history</div>
          {guests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 24 }}>
              No guests yet this season.
            </div>
          ) : (
            <div className="list-card">
              {guests.map(g => {
                const ini = g.guest_name.split(' ').map(w => w[0]).join('')
                return (
                  <div key={g.id} className="list-item">
                    <div className="avatar" style={{ width: 34, height: 34, fontSize: 12, background: '#e6f1fb', color: '#185fa5' }}>{ini}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{g.guest_name}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                        {g.visit_date ? new Date(g.visit_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date TBD'}
                      </div>
                    </div>
                    <span className={`badge ${g.paid ? 'badge-green' : 'badge-amber'}`}>
                      {g.paid ? 'Paid' : 'Due'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
