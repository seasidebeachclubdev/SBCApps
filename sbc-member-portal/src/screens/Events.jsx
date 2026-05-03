import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Events() {
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
