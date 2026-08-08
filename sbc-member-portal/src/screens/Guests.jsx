import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { FEES, carFeeFor, guestFeeFor, GUEST_FEE_TEXT, CAR_FEE_TEXT } from '../lib/fees'
import Icon from '../components/Icon'

const EMPTY_FORM = { name: '', email: '', phone: '', date: '', ageGroup: 'adult', ownCar: false, paidBy: 'member' }

export default function Guests() {
  const { member } = useAuth()
  const [guests, setGuests] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
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
    // the car fee depends on which day it is, so the date is required for one
    if (form.ownCar && !form.date) {
      setError('Pick a visit date so the guest car fee can be worked out (weekday or weekend).')
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
      age_group: form.ageGroup,
      own_car: form.ownCar,
      paid_by: form.paidBy,
      // the database recomputes this from the schedule; sent so the row is
      // never briefly wrong if a trigger is ever bypassed
      fee: guestFeeFor({ age_group: form.ageGroup, own_car: form.ownCar, visit_date: form.date }),
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
      setForm(EMPTY_FORM)
      setToast(`QR pass sent to you and ${form.name}`)
      fetchGuests()
      setTimeout(() => setToast(''), 3000)
    }
    setSaving(false)
  }

  const totalFee = guestFeeFor({ age_group: form.ageGroup, own_car: form.ownCar, visit_date: form.date })

  return (
    <div className="screen">
      {toast && <div className="success-box"><Icon name="check" size={15} />{toast}</div>}

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
              <div className="fg">
                <label className="fl">Guest age</label>
                <select value={form.ageGroup} onChange={e => setForm({ ...form, ageGroup: e.target.value })}>
                  <option value="adult">18 and over — ${FEES.adult}</option>
                  <option value="child">Under 18 — ${FEES.child}</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={form.ownCar}
                  onChange={e => setForm({ ...form, ownCar: e.target.checked })}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
                <span>
                  Arriving in their own car
                  <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                    Car fee {CAR_FEE_TEXT}{form.date ? ` — $${carFeeFor(form.date)} on this date` : ''}
                  </div>
                </span>
              </label>
              <div className="fg">
                <label className="fl">Who pays at the gate?</label>
                <select value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })}>
                  <option value="member">I'll pay — added to my account</option>
                  <option value="guest">My guest pays at the gate</option>
                </select>
              </div>
              <div className="card" style={{ margin: 0, background: '#f2f2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6b6b6b' }}>
                  Total {form.paidBy === 'member' ? '(on your account)' : '(guest pays)'}
                </span>
                <strong style={{ fontSize: 18 }}>${totalFee}</strong>
              </div>
              <div className="warn-box" style={{ margin: 0 }}>
                Guests must check in at the gate immediately upon arrival, including guests in your vehicle. Failure to do so may result in revocation of membership.
              </div>
              <div className="info-box">
                A QR code will be emailed to you and your guest. Fees are collected by a gate attendant (cash or check). The same guest may not visit more than 4 times per season across all members.
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
              <br />
              <strong style={{ color: '#1a1a1a' }}>{GUEST_FEE_TEXT}.</strong> Guest cars {CAR_FEE_TEXT}.
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
                        {' · '}${g.fee}
                        {g.own_car ? ' · own car' : ''}
                        {g.age_group === 'child' ? ' · under 18' : ''}
                        {' · '}{g.paid_by === 'guest' ? 'guest pays' : 'you pay'}
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
