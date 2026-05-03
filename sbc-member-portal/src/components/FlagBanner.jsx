import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const FLAGS = {
  green:  { color: '#2e9e55', bg: '#eaf7ee', border: '#8dd4a8', text: '#1a5c33', label: 'Green Flag',  desc: 'Safe conditions · Lifeguards on duty' },
  yellow: { color: '#d4a017', bg: '#fdf8e6', border: '#f0d060', text: '#7a5500', label: 'Yellow Flag', desc: 'Moderate surf or currents · Swim with caution' },
  red:    { color: '#d63c3c', bg: '#fdeaea', border: '#f09595', text: '#7a1a1a', label: 'Red Flag',    desc: 'High surf or dangerous conditions · No swimming' },
  purple: { color: '#8a3ab9', bg: '#f3eaf9', border: '#c89ae0', text: '#4a1a70', label: 'Purple Flag', desc: 'Dangerous marine life present · Use caution' },
}

export default function FlagBanner() {
  const [flagColor, setFlagColor] = useState('green')

  useEffect(() => {
    fetchFlag()

    // Realtime subscription — flag updates appear instantly for members
    const channel = supabase
      .channel('beach_flag')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beach_flag' }, payload => {
        if (payload.new?.color) setFlagColor(payload.new.color)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchFlag() {
    const { data } = await supabase
      .from('beach_flag')
      .select('color')
      .single()
    if (data?.color) setFlagColor(data.color)
  }

  const f = FLAGS[flagColor] || FLAGS.green

  return (
    <div
      className="flag-banner"
      style={{ background: f.bg, border: `1px solid ${f.border}` }}
    >
      <div className="flag-swatch" style={{ background: f.color }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: f.text }}>{f.label}</div>
        <div style={{ fontSize: 12, color: f.text, opacity: 0.85, marginTop: 2 }}>{f.desc}</div>
      </div>
    </div>
  )
}
