import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Pay() {
  const { employee } = useAuth()
  const [records, setRecords] = useState([])
  const [totalHours, setTotalHours] = useState(0)

  useEffect(() => { fetchRecords() }, [])

  async function fetchRecords() {
    // Last 30 days of clock records
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const { data } = await supabase
      .from('clock_records')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('shift_date', since.toISOString().slice(0, 10))
      .not('clock_out', 'is', null)
      .order('shift_date', { ascending: false })

    setRecords(data || [])
    const hrs = (data || []).reduce((a, r) => {
      if (!r.clock_in || !r.clock_out) return a
      return a + (new Date(r.clock_out) - new Date(r.clock_in)) / 3600000
    }, 0)
    setTotalHours(Math.round(hrs * 10) / 10)
  }

  const HOURLY_RATE = 16
  const TARGET_HOURS = 40
  const pct = Math.min(100, Math.round((totalHours / TARGET_HOURS) * 100))

  return (
    <div className="screen">
      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-label">Hours (30 days)</div>
          <div className="stat-value">{totalHours}</div>
          <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 2 }}>of {TARGET_HOURS} target</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Est. gross</div>
          <div className="stat-value" style={{ fontSize: 20 }}>${(totalHours * HOURLY_RATE).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 2 }}>at ${HOURLY_RATE}/hr</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6b6b6b' }}>Period progress</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 5 }}>Direct deposit on pay dates</div>
      </div>

      <div className="section-label">Recent records</div>
      {records.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 20 }}>No records yet.</div>
      ) : (
        <div className="list-card">
          {records.slice(0, 10).map(r => {
            const hrs = r.clock_in && r.clock_out
              ? Math.round(((new Date(r.clock_out) - new Date(r.clock_in)) / 3600000) * 10) / 10
              : 0
            return (
              <div key={r.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {new Date(r.shift_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b6b6b' }}>{hrs} hrs</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>${(hrs * HOURLY_RATE).toFixed(0)}</span>
                <span className="badge badge-green" style={{ marginLeft: 8 }}>Logged</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.6 }}>
        Pay stubs emailed after each pay period. Questions? 401-322-0201.
      </div>
    </div>
  )
}
