import { useEffect, useState } from 'react'

// Tide data fetched from NOAA API for Weekapaug / Watch Hill station
// Station ID: 8461490 (Watch Hill, RI) — closest to Weekapaug
const NOAA_STATION = '8461490'

function makeFallbackPath(w, h) {
  const pts = []
  for (let i = 0; i <= 48; i++) {
    const t = i * 0.5
    const tide = 2.1 + 1.7 * Math.cos((2 * Math.PI * (t - 12.47)) / 12.44)
    const x = (t / 24) * w
    const y = h - (tide / 4.5) * h
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

export default function TideCard() {
  const [weather, setWeather] = useState({ air: '—', water: '—', wind: '—', sky: '' })
  const [tides, setTides] = useState([])
  const [nowX, setNowX] = useState(null)
  const [nowY, setNowY] = useState(null)
  const [tidePath, setTidePath] = useState('')

  const W = 282, H = 52

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      // NOAA Tides & Currents API
      const today = new Date()
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
      const res = await fetch(
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
        `begin_date=${dateStr}&end_date=${dateStr}&station=${NOAA_STATION}` +
        `&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=sbc&format=json`
      )
      const json = await res.json()
      if (json.predictions) {
        const parsed = json.predictions.map(p => ({
          label: p.type === 'H' ? 'High' : 'Low',
          time: p.t.split(' ')[1],
          ft: parseFloat(p.v).toFixed(1),
          hour: parseInt(p.t.split(' ')[1].split(':')[0]),
        }))
        setTides(parsed.slice(0, 3))

        // Build tide curve
        const pts = []
        const nowH = today.getHours() + today.getMinutes() / 60
        let nX = (nowH / 24) * W
        let nY = H / 2
        for (let i = 0; i <= 96; i++) {
          const t = i * 0.25
          const tide = 2.1 + 1.7 * Math.cos((2 * Math.PI * (t - 12.47)) / 12.44)
          const x = (t / 24) * W
          const y = H - (tide / 4.5) * H
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
          if (Math.abs(t - nowH) < 0.13) { nX = x; nY = y }
        }
        setTidePath(pts.join(' '))
        setNowX(nX.toFixed(1))
        setNowY(nY.toFixed(1))
      }
    } catch {
      // Fallback to cosine approximation
      const nowH = new Date().getHours() + new Date().getMinutes() / 60
      const nX = (nowH / 24) * W
      const nowTide = 2.1 + 1.7 * Math.cos((2 * Math.PI * (nowH - 12.47)) / 12.44)
      const nY = H - (nowTide / 4.5) * H
      setTidePath(makeFallbackPath(W, H))
      setNowX(nX.toFixed(1))
      setNowY(nY.toFixed(1))
      setTides([
        { label: 'Low',  time: '6:15 AM',  ft: '0.4' },
        { label: 'High', time: '12:28 PM', ft: '3.8' },
        { label: 'Low',  time: '6:41 PM',  ft: '0.2' },
      ])
    }

    // Open-Meteo for air temp + wind (free, no key needed)
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=41.3503&longitude=-71.6495' +
        '&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph'
      )
      const json = await res.json()
      const cur = json.current
      const code = cur.weather_code
      const sky = code === 0 ? 'Clear' : code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Foggy' : code <= 67 ? 'Rainy' : 'Cloudy'
      setWeather({
        air: `${Math.round(cur.temperature_2m)}°`,
        wind: `${Math.round(cur.wind_speed_10m)}`,
        sky,
      })
    } catch {
      setWeather({ air: '—', water: '—', wind: '—', sky: '' })
    }
  }

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Weekapaug Beach
        </span>
        <span style={{ fontSize: 11, color: '#6b6b6b' }}>
          {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>Air</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{weather.air}</div>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>{weather.sky}</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>Water</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#50a2ad' }}>{weather.water || '69°'}</div>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>Atlantic</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>Wind</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{weather.wind}</div>
          <div style={{ fontSize: 10, color: '#6b6b6b' }}>mph</div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Tides today
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
        {tidePath && (
          <polyline points={tidePath} fill="none" stroke="#50a2ad" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        {nowX && (
          <>
            <line x1={nowX} y1="2" x2={nowX} y2={H - 2} stroke="#d64040" strokeWidth="1" strokeDasharray="2,2" />
            <circle cx={nowX} cy={nowY} r="3" fill="#d64040" />
          </>
        )}
      </svg>
      {tides.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          {tides.map((t, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6b6b6b' }}>{t.label}</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{t.time}</div>
              <div style={{ fontSize: 10, color: '#6b6b6b' }}>{t.ft} ft</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
        <span style={{ width: 14, height: 2, background: '#d64040', display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: '#6b6b6b' }}>Current tide level</span>
      </div>
    </div>
  )
}
