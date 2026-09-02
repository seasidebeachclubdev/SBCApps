import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Icon from './components/Icon'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
import Onboarding from './screens/Onboarding'
import Privacy from './screens/Privacy'
import Support from './screens/Support'
import Home from './screens/Home'
import Guests from './screens/Guests'
import Fees from './screens/Fees'
import Events from './screens/Events'
import Issues from './screens/Issues'
import Rules from './screens/Rules'
import Vehicles from './screens/Vehicles'

const NAV_TABS = [
  { path: '/home',     icon: 'home',       label: 'Home' },
  { path: '/guests',   icon: 'users',      label: 'My Guests' },
  { path: '/fees',     icon: 'creditCard', label: 'Fees' },
  { path: '/vehicles', icon: 'car',        label: 'My Vehicles' },
  { path: '/events',   icon: 'calendar',   label: 'Events & Notices' },
  { path: '/issues',   icon: 'flag',       label: 'Issues' },
  { path: '/rules',    icon: 'clipboard',  label: 'Rules & Regs' },
]

const TITLES = Object.fromEntries(NAV_TABS.map(t => [t.path, t.label]))

function NoAccount({ message }) {
  const { signOut } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 8, padding: 24, textAlign: 'center' }}>
      <span style={{ fontSize: 14 }}>{message}</span>
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>
        Contact the club office at 401-322-0201 or seasidebeachclub@gmail.com.
      </span>
      <button onClick={signOut} style={{ marginTop: 10, padding: '10px 22px', border: 'none', borderRadius: 8, background: '#50a2ad', color: '#fff', fontSize: 14 }}>Sign Out</button>
    </div>
  )
}

// Every section lives in one drawer, so nothing is hidden behind a tab bar
// that only fits a few of them.
function NavDrawer({ open, onClose }) {
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
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--teal)' }}>Member Portal</div>
        </div>
        {NAV_TABS.map(t => (
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

function ProtectedLayout() {
  const { member, signOut } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  if (member && !member.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icon name="menu" size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="top-bar-sub">Seaside Beach Club</div>
          <div className="top-bar-title">{TITLES[location.pathname] || ''}</div>
        </div>
        <button className="top-bar-action" onClick={signOut}>
          <Icon name="logOut" size={15} /> Sign Out
        </button>
      </div>
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Routes>
        <Route path="/home"   element={<Home />} />
        <Route path="/guests" element={<Guests />} />
        <Route path="/fees"   element={<Fees />} />
        <Route path="/events" element={<Events />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/rules"  element={<Rules />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="*"       element={<Navigate to="/home" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  const { session, member, loading, recovery } = useAuth()
  const location = useLocation()

  // public pages - required by the app stores, no login needed
  if (location.pathname === '/privacy') return <Privacy />
  if (location.pathname === '/support') return <Support />

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#50a2ad', fontSize: 14 }}>Loading…</span>
      </div>
    )
  }

  if (recovery && session) return <ResetPassword />
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (!member) return <NoAccount message="No member account is linked to this login." />
  if (!member.onboarded) return <Routes><Route path="*" element={<Onboarding />} /></Routes>

  return <ProtectedLayout />
}
