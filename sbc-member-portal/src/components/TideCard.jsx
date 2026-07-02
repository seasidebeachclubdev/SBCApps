import { useEffect, useState } from 'react'

// Watch Hill, RI (NOAA station 8461490) is the closest tide station to
// Weekapaug. Lat/lon are the beach itself for air + sea-surface weather.
const NOAA_STATION = '8461490'
const LAT = 41.3503
const LON = -71.6495
const W = 282, H = 52

const cToF = c => Math.round((c * 9) / 5 + 32)

// Synthetic semidiurnal curve, used only if the NOAA call fails.
function fallbackCurvePoints() {
  const pts = []
  for (let i = 0; i <= 48; i++) {
    const t = i * 0.5
    pts.push({ hour: t, v: 2.1 + 1.7 * Math.cos((2 * Math.PI * (t - 12.47)) / 12.44) })
  }
  return pts
}

export default function TideCard() {
  const [weather, setWeather] = useState({ air: '—', water: '—', wind: '—', sky: '' })
  const [tides, setTides] = useState([])
  const [nowX, setNowX] = useState(null)
  const [nowY, setNowY] = useState(null)
  const [tidePath, setTidePath] = useState('')

  useEffect(() => {
    fetchTideLabels()
    fetchTideCurve()
    fetchWeather()
    fetchWaterTemp()
  }, [])

  // Scale a set of {hour, v} points into the SVG box and place the "now" dot
  // by interpolating the real curve at the current time.
  function renderCurve(pts) {
    const vs = pts.map(p => p.v)
    const min = Math.min(...vs), max = Math.max(...vs)
    const range = max - min || 1
    const pad = 0.14 * H
    const toX = hour => (hour / 24) * W
    const toY = v => H - pad - ((v - min) / range) * (H - 2 * pad)

    setTidePath(pts.map(p => `${toX(p.hour).toFixed(1)},${toY(p.v).toFixed(1)}`).join(' '))

    const now = new Date()
    const nowH = now.getHours() + now.getMinutes() / 60
    let v = pts[pts.length - 1].v
    for (let i = 0; i < pts.length - 1; i++) {
      if (nowH >= pts[i].hour && nowH <= pts[i + 1].hour) {
        const f = (nowH - pts[i].hour) / (pts[i + 1].hour - pts[i].hour)
        v = pts[i].v + f * (pts[i + 1].v - pts[i].v)
        break
      }
    }
    setNowX(toX(nowH).toFixed(1))
    setNowY(toY(v).toFixed(1))
  }

  function todayStr() {
    // local date - toISOString() is UTC and rolls to tomorrow after ~8pm ET
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }

  // Real tide curve from NOAA hourly water-level predictions.
  async function fetchTideCurve() {
    try {
      const res = await fetch(
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
        `begin_date=${todayStr()}&end_date=${todayStr()}&station=${NOAA_STATION}` +
        `&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=h&units=english&application=sbc&format=json`
      )
      const json = await res.json()
      if (!json.predictions?.length) throw new Error('no predictions')
      const pts = json.predictions.map(p => {
        const [hh, mm] = p.t.split(' ')[1].split(':').map(Number)
        return { hour: hh + mm / 60, v: parseFloat(p.v) }
      })
      renderCurve(pts)
    } catch {
      renderCurve(fallbackCurvePoints())
    }
  }

  // Real high/low times + heights from NOAA. Show the next three events so the
  // card stays useful into the evening rather than listing the morning's tides.
  async function fetchTideLabels() {
    try {
      const res = await fetch(
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
        `begin_date=${todayStr()}&end_date=${todayStr()}&station=${NOAA_STATION}` +
        `&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=sbc&format=json`
      )
      const json = await res.json()
      if (!json.predictions?.length) throw new Error('no predictions')
      const now = new Date()
      const events = json.predictions.map(p => {
        const [hh, mm] = p.t.split(' ')[1].split(':').map(Number)
        const dt = new Date(now); dt.setHours(hh, mm, 0, 0)
        return {
          label: p.type === 'H' ? 'High' : 'Low',
          time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          ft: parseFloat(p.v).toFixed(1),
          past: dt < now,
        }
      })
      const upcoming = events.filter(e => !e.past)
      const shown = upcoming.length >= 3 ? upcoming.slice(0, 3) : events.slice(-3)
      setTides(shown.map(({ label, time, ft }) => ({ label, time, ft })))
    } catch {
      setTides([])
    }
  }

  // Air temp, wind, sky from Open-Meteo (free, no key).
  async function fetchWeather() {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`
      )
      const json = await res.json()
      const cur = json.current
      const c = cur.weather_code
      const sky = c === 0 ? 'Clear' : c <= 3 ? 'Partly cloudy' : c <= 48 ? 'Foggy'
        : c <= 67 ? 'Rainy' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : 'Stormy'
      setWeather(w => ({ ...w, air: `${Math.round(cur.temperature_2m)}°`, wind: `${Math.round(cur.wind_speed_10m)}`, sky }))
    } catch {
      // leave dashes
    }
  }

  // Live sea-surface temperature from Open-Meteo's marine API (Celsius -> F).
  async function fetchWaterTemp() {
    try {
      const res = await fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=sea_surface_temperature`
      )
      const json = await res.json()
      const c = json?.current?.sea_surface_temperature
      if (typeof c === 'number') setWeather(w => ({ ...w, water: `${cToF(c)}°` }))
    } catch {
      // leave dash
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
          <div style={{ fontSize: 20, fontWeight: 600, color: '#50a2ad' }}>{weather.water}</div>
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
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', width: '100%' }}>
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
