import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
import Onboarding from './screens/Onboarding'
import Privacy from './screens/Privacy'
import Home from './screens/Home'
import Guests from './screens/Guests'
import Fees from './screens/Fees'
import Events from './screens/Events'
import Issues from './screens/Issues'
import Rules from './screens/Rules'
import NavBar from './components/NavBar'
import TopBar from './components/TopBar'

const NAV_TABS = [
  { path: '/home',   icon: '⌂',   label: 'Home'   },
  { path: '/guests', icon: '👥',  label: 'Guests' },
  { path: '/fees',   icon: '💳',  label: 'Fees'   },
  { path: '/events', icon: '📅',  label: 'Events' },
  { path: '/issues', icon: '⚑',   label: 'Issues' },
  { path: '/rules',  icon: '📋',  label: 'Rules'  },
]

const TITLES = {
  '/home':   'Home',
  '/guests': 'My Guests',
  '/fees':   'Fees',
  '/events': 'Events & Notices',
  '/issues': 'Issues',
  '/rules':  'Rules & Regs',
}

function NoAccount({ message }) {
  const { signOut } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 8, padding: 24, textAlign: 'center' }}>
      <span style={{ fontSize: 14 }}>{message}</span>
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>Contact the club office at 401-322-0201.</span>
      <button onClick={signOut} style={{ marginTop: 10, padding: '10px 22px', border: 'none', borderRadius: 8, background: '#50a2ad', color: '#fff', fontSize: 14 }}>Sign Out</button>
    </div>
  )
}

function ProtectedLayout() {
  const { member } = useAuth()
  const location = useLocation()

  if (member && !member.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar subtitle="Seaside Beach Club" title={TITLES[location.pathname] || ''} />
      <Routes>
        <Route path="/home"   element={<Home />} />
        <Route path="/guests" element={<Guests />} />
        <Route path="/fees"   element={<Fees />} />
        <Route path="/events" element={<Events />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/rules"  element={<Rules />} />
        <Route path="*"       element={<Navigate to="/home" replace />} />
      </Routes>
      <NavBar tabs={NAV_TABS} />
    </div>
  )
}

export default function App() {
  const { session, member, loading, recovery } = useAuth()
  const location = useLocation()

  // public page - required by the app stores, no login needed
  if (location.pathname === '/privacy') return <Privacy />

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
