import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
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

function NoAccount({ message }) {
  const { signOut } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 8, padding: 24, textAlign: 'center' }}>
      <span style={{ fontSize: 14 }}>{message}</span>
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>Contact your manager if this is unexpected.</span>
      <button onClick={signOut} style={{ marginTop: 10, padding: '10px 22px', border: 'none', borderRadius: 8, background: '#50a2ad', color: '#fff', fontSize: 14 }}>Sign Out</button>
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
  const { session, employee, loading, recovery } = useAuth()
  if (loading) return <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span style={{ color: '#50a2ad' }}>Loading…</span></div>
  if (recovery && session) return <ResetPassword />
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (!employee) return <NoAccount message="No staff account is linked to this login." />
  return <ProtectedLayout />
}
