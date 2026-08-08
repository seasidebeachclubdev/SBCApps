import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Icon from './components/Icon'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
import Schedule from './screens/Schedule'
import Clock from './screens/Clock'
import Swap from './screens/Swap'
import Pay from './screens/Pay'
import Gate from './screens/Gate'

const TITLES = {
  '/gate':     'Gate Check-In',
  '/schedule': 'My Schedule',
  '/clock':    'Time Clock',
  '/swap':     'Shift Swap',
  '/pay':      'Pay Summary',
}

const NAV_TABS = [
  { path: '/schedule', icon: 'calendar', label: 'My Schedule' },
  { path: '/clock',    icon: 'clock',    label: 'Time Clock' },
  { path: '/swap',     icon: 'repeat',   label: 'Shift Swap' },
  { path: '/pay',      icon: 'dollar',   label: 'Pay Summary' },
]

// gate staff get the scanner as their first section
const tabsFor = employee => employee?.role === 'gate_device'
  ? [{ path: '/gate', icon: 'scan', label: 'Gate Check-In' }, ...NAV_TABS]
  : NAV_TABS

function NavDrawer({ open, onClose }) {
  const { employee } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function go(path) {
    navigate(path)
    onClose()
  }

  return (
    <>
      {open && <div className="nav-backdrop" onClick={onClose} />}
      <nav className={`nav-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Seaside Beach Club
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--teal)' }}>Staff</div>
        </div>
        {tabsFor(employee).map(t => (
          <div
            key={t.path}
            className={`drawer-item ${location.pathname === t.path ? 'active' : ''}`}
            onClick={() => go(t.path)}
          >
            <Icon name={t.icon} size={19} />
            <span>{t.label}</span>
          </div>
        ))}
      </nav>
    </>
  )
}

function TopBar({ onMenu }) {
  const { employee, signOut } = useAuth()
  const location = useLocation()
  return (
    <div className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button className="hamburger" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="top-bar-sub">SBC Staff · {employee?.area || ''}</div>
        <div className="top-bar-title">{TITLES[location.pathname] || 'Schedule'}</div>
      </div>
      <button className="top-bar-action" onClick={signOut}>
        <Icon name="logOut" size={15} /> Sign Out
      </button>
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
  const { employee } = useAuth()
  const isGate = employee?.role === 'gate_device'
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar onMenu={() => setMenuOpen(true)} />
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Routes>
        <Route path="/gate"     element={isGate ? <Gate /> : <Navigate to="/schedule" replace />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/clock"    element={<Clock />} />
        <Route path="/swap"     element={<Swap />} />
        <Route path="/pay"      element={<Pay />} />
        <Route path="*"         element={<Navigate to={isGate ? '/gate' : '/schedule'} replace />} />
      </Routes>
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
