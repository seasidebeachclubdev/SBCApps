// Members keep their own vehicles up to date. The gate matches arrivals by
// plate, so a stale plate is the usual reason a member gets stopped.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const EMPTY = { make: '', model: '', color: '', license_plate: '' }

export default function Vehicles() {
  const { member } = useAuth()
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState([])
  const [editing, setEditing] = useState(null) // vehicle id, or 'new'
  const [form, setForm] = useState(EMPTY)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // stickers cap how many cars a membership may register
  const maxVehicles = member?.two_stickers ? 2 : 1

  useEffect(() => { fetchVehicles() }, [])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function fetchVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('member_id', member.member_id)
      .order('created_at')
    setVehicles(data || [])
  }

  function startAdd() {
    setError('')
    setForm(EMPTY)
    setEditing('new')
  }

  function startEdit(v) {
    setError('')
    setForm({ make: v.make ?? '', model: v.model ?? '', color: v.color ?? '', license_plate: v.license_plate ?? '' })
    setEditing(v.id)
  }

  async function save(e) {
    e.preventDefault()
    if (!form.license_plate.trim()) {
      setError('A license plate is required — the gate matches arrivals by plate.')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      color: form.color.trim() || null,
      license_plate: form.license_plate.trim().toUpperCase(),
    }
    const { error: err } = editing === 'new'
      ? await supabase.from('vehicles').insert({ member_id: member.member_id, ...payload })
      : await supabase.from('vehicles').update(payload).eq('id', editing)
    setSaving(false)
    if (err) return setError('Could not save that vehicle. Please try again.')
    setEditing(null)
    flash(editing === 'new' ? 'Vehicle added' : 'Vehicle updated')
    fetchVehicles()
  }

  async function remove(v) {
    const { error: err } = await supabase.from('vehicles').delete().eq('id', v.id)
    flash(err ? 'Could not remove that vehicle' : 'Vehicle removed')
    fetchVehicles()
  }

  return (
    <div className="screen">
      {toast && <div className="success-box">✓ {toast}</div>}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => navigate('/home')}>‹ Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>My Vehicles</div>
          <div style={{ fontSize: 11, color: '#6b6b6b' }}>
            {member?.two_stickers ? 'Family membership — up to 2 vehicles' : 'Up to 1 vehicle'}
          </div>
        </div>
      </div>

      {vehicles.length === 0 && editing !== 'new' && (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>
          No vehicles on file yet.
        </div>
      )}

      {vehicles.map(v => (
        <div key={v.id}>
          {editing === v.id ? (
            <VehicleForm form={form} setForm={setForm} onSubmit={save} onCancel={() => setEditing(null)} saving={saving} error={error} label="Save Changes" />
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 26 }}>🚗</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{v.license_plate || 'No plate'}</div>
                <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                  {[v.color, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle details not set'}
                </div>
              </div>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => startEdit(v)}>Edit</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => remove(v)}>Remove</button>
            </div>
          )}
        </div>
      ))}

      {editing === 'new' && (
        <VehicleForm form={form} setForm={setForm} onSubmit={save} onCancel={() => setEditing(null)} saving={saving} error={error} label="Add Vehicle" />
      )}

      {editing === null && (
        <div className="card">
          {vehicles.length < maxVehicles ? (
            <button className="btn-primary" onClick={startAdd}>+ Add Vehicle</button>
          ) : (
            <div style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.6 }}>
              You have registered all {maxVehicles} vehicle{maxVehicles > 1 ? 's' : ''} your membership allows.
              Edit or remove one to register a different car, or call the office at 401-322-0201.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.6 }}>
        Parking stickers are issued per membership and are not transferable. Vehicles without a
        sticker are charged the car fee: $50 weekdays, $100 weekends.
      </div>
    </div>
  )
}

function VehicleForm({ form, setForm, onSubmit, onCancel, saving, error, label }) {
  return (
    <div className="card">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="fg">
          <label className="fl">License plate</label>
          <input
            type="text"
            placeholder="RI ABC123"
            value={form.license_plate}
            onChange={e => setForm({ ...form, license_plate: e.target.value })}
            required
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg">
            <label className="fl">Make</label>
            <input type="text" placeholder="Toyota" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl">Model</label>
            <input type="text" placeholder="RAV4" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Color</label>
          <input type="text" placeholder="Blue" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
        </div>
        {error && <div className="error-text" style={{ textAlign: 'left' }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : label}</button>
        <button type="button" className="btn-secondary" style={{ textAlign: 'center' }} onClick={onCancel}>Cancel</button>
      </form>
    </div>
  )
}
