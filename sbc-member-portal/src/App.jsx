import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
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
  const { session, member, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#50a2ad', fontSize: 14 }}>Loading…</span>
      </div>
    )
  }

  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (member && !member.onboarded) return <Routes><Route path="*" element={<Onboarding />} /></Routes>

  return <ProtectedLayout />
}
