import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Onboarding() {
  const { member, setMember } = useAuth()
  const [step, setStep] = useState(1)
  const [household, setHousehold] = useState([''])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(member?.email || '')
  const [vehicles, setVehicles] = useState([{ make: '', model: '', color: '', plate: '' }])
  const [saving, setSaving] = useState(false)

  const maxVehicles = member?.two_stickers ? 2 : 1

  function addHousehold() { setHousehold([...household, '']) }
  function removeHousehold(i) { setHousehold(household.filter((_, idx) => idx !== i)) }
  function updateHousehold(i, val) { const h = [...household]; h[i] = val; setHousehold(h) }

  function addVehicle() {
    if (vehicles.length < maxVehicles) setVehicles([...vehicles, { make: '', model: '', color: '', plate: '' }])
  }
  function updateVehicle(i, field, val) {
    const v = [...vehicles]; v[i][field] = val; setVehicles(v)
  }

  async function complete() {
    setSaving(true)
    // Save household members
    const householdRows = household.filter(n => n.trim()).map(name => ({
      member_id: member.member_id,
      full_name: name.trim(),
      verified: name.trim().toLowerCase() === `${member.first_name} ${member.last_name}`.toLowerCase(),
    }))
    if (householdRows.length) {
      await supabase.from('household_members').insert(householdRows)
    }

    // Save contact info
    await supabase.from('members').update({ phone, email }).eq('id', member.id)

    // Save vehicles
    const vehicleRows = vehicles.filter(v => v.make.trim()).map(v => ({
      member_id: member.member_id,
      ...v,
    }))
    if (vehicleRows.length) {
      await supabase.from('vehicles').insert(vehicleRows)
    }

    // Mark onboarded
    const { data } = await supabase
      .from('members')
      .update({ onboarded: true })
      .eq('id', member.id)
      .select()
      .single()

    // Notify ops managers via Supabase Edge Function
    await supabase.functions.invoke('notify-onboarding', {
      body: { member_id: member.member_id, name: `${member.first_name} ${member.last_name}` }
    })

    setMember(data)
    setSaving(false)
  }

  const steps = ['Household', 'Contact', 'Vehicles']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="top-bar">
        <div className="top-bar-sub">Welcome to SBC · Step {step} of 3</div>
        <div className="top-bar-title">Account Setup</div>
      </div>
      <div className="onboarding-wrap">
        <div className="step-bar">
          {steps.map((s, i) => (
            <div
              key={s}
              className="step-seg"
              style={{ background: i < step ? '#50a2ad' : '#e0e0e0' }}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Household Names</div>
            <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14, lineHeight: 1.5 }}>
              Confirm the names registered on your account. Unrecognized names will be flagged for management review.
            </div>
            {household.map((name, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={e => updateHousehold(i, e.target.value)}
                  style={{ flex: 1 }}
                />
                {household.length > 1 && (
                  <button onClick={() => removeHousehold(i)} style={{ background: 'none', border: 'none', color: '#d64040', fontSize: 20, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            <button className="btn-secondary" onClick={addHousehold} style={{ width: '100%', textAlign: 'center', marginBottom: 14 }}>
              + Add household member
            </button>
            <button className="btn-primary" onClick={() => setStep(2)}>Continue</button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Contact Info</div>
            <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
              Used for guest check-in SMS and fee reminders.
            </div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl">Mobile phone</label>
              <input type="tel" placeholder="(401) 555-0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="fg" style={{ marginBottom: 16 }}>
              <label className="fl">Email address</label>
              <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={() => setStep(3)}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Vehicles</div>
            <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
              Register your vehicle{maxVehicles > 1 ? 's' : ''} for your parking sticker{maxVehicles > 1 ? ' (up to 2)' : ''}.
            </div>
            {vehicles.map((v, i) => (
              <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 8 }}>Vehicle {i + 1}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="text" placeholder="Make" value={v.make} onChange={e => updateVehicle(i, 'make', e.target.value)} />
                  <input type="text" placeholder="Model" value={v.model} onChange={e => updateVehicle(i, 'model', e.target.value)} />
                  <input type="text" placeholder="Color" value={v.color} onChange={e => updateVehicle(i, 'color', e.target.value)} />
                  <input type="text" placeholder="License plate" value={v.plate} onChange={e => updateVehicle(i, 'plate', e.target.value)} />
                </div>
              </div>
            ))}
            {vehicles.length < maxVehicles && (
              <button className="btn-secondary" style={{ width: '100%', textAlign: 'center', marginBottom: 12 }} onClick={addVehicle}>
                + Add second vehicle
              </button>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(2)}>Back</button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={complete} disabled={saving}>
                {saving ? 'Saving…' : 'Complete Setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
