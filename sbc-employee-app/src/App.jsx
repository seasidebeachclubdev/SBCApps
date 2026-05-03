import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './screens/Login'
import Schedule from './screens/Schedule'
import Clock from './screens/Clock'
import Swap from './screens/Swap'
import Pay from './screens/Pay'

const TITLES = {
  '/schedule': 'My Schedule',
  '/clock':    'Time Clock',
  '/swap':     'Shift Swap',
  '/pay':      'Pay Summary',
}

const NAV_TABS = [
  { path: '/schedule', icon: '📅', label: 'Schedule' },
  { path: '/clock',    icon: '⏱',  label: 'Clock'    },
  { path: '/swap',     icon: '🔄', label: 'Swap'     },
  { path: '/pay',      icon: '💰', label: 'Pay'      },
]

function NavBar() {
  const location = useLocation()
  return (
    <div className="bottom-nav">
      {NAV_TABS.map(t => (
        <div key={t.path} className={`nav-item ${location.pathname === t.path ? 'active' : ''}`} onClick={() => window.location.href = t.path}>
          <span className="icon">{t.icon}</span>
          <span className="label">{t.label}</span>
        </div>
      ))}
    </div>
  )
}

function TopBar() {
  const { employee } = useAuth()
  const location = useLocation()
  return (
    <div className="top-bar">
      <div className="top-bar-sub">SBC Staff · {employee?.area || ''}</div>
      <div className="top-bar-title">{TITLES[location.pathname] || 'Schedule'}</div>
    </div>
  )
}

function ProtectedLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar />
      <Routes>
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/clock"    element={<Clock />} />
        <Route path="/swap"     element={<Swap />} />
        <Route path="/pay"      element={<Pay />} />
        <Route path="*"         element={<Navigate to="/schedule" replace />} />
      </Routes>
      <NavBar />
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span style={{ color: '#50a2ad' }}>Loading…</span></div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  return <ProtectedLayout />
}
