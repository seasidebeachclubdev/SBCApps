import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Members() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { fetchMembers() }, [])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').order('last_name')
    setMembers(data || [])
  }

  const filtered = members.filter(m =>
    !search ||
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    m.member_id?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="screen">
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