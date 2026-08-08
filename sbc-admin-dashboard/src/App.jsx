import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Icon from './components/Icon'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
import Overview from './screens/Overview'
import Gate from './screens/Gate'
import Members from './screens/Members'
import Fees from './screens/Fees'
import Employees from './screens/Employees'
import Payroll from './screens/Payroll'
import Comms from './screens/Comms'
import Issues from './screens/Issues'
import Reports from './screens/Reports'

const SCREEN_MAP = { overview: Overview, gate: Gate, members: Members, fees: Fees, employees: Employees, payroll: Payroll, comms: Comms, issues: Issues, reports: Reports }
const TITLES = { overview: 'Overview', gate: 'Gate Check-In', members: 'Members', fees: 'Fees', employees: 'Employees', payroll: 'Payroll', comms: 'Comms', issues: 'Issues', reports: 'Reports' }
const ICONS  = { overview: 'home', gate: 'scan', members: 'users', fees: 'creditCard', employees: 'briefcase', payroll: 'dollar', comms: 'megaphone', issues: 'flag', reports: 'barChart' }

// Nine sections never fitted a tab bar - it scrolled off the edge - so the
// admin navigates from a drawer instead.
function NavDrawer({ tabs, open, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const current = location.pathname.slice(1)

  // Escape closes it, same as tapping away
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function go(t) {
    navigate(`/${t}`)   // client-side: the old bar reloaded the whole app
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
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--teal)' }}>Admin</div>
        </div>
        {tabs.map(t => (
          <div
            key={t}
            className={`drawer-item ${current === t ? 'active' : ''}`}
            onClick={() => go(t)}
          >
            <Icon name={ICONS[t]} size={19} />
            <span>{TITLES[t]}</span>
          </div>
        ))}
      </nav>
    </>
  )
}

const signOutStyle = {
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.4)',
  color: '#fff',
  borderRadius: 7,
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
}

function TopBar({ onMenu }) {
  const { admin, signOut } = useAuth()
  const location = useLocation()
  const tab = location.pathname.slice(1)
  const roleLabel = { gate_device: 'Gate Device', ops_manager: 'Ops Manager', business_manager: 'Business Mgr' }[admin?.role] || ''
  return (
    <div className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button className="hamburger" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="top-bar-sub">{roleLabel} · admin.sbcri.com</div>
        <div className="top-bar-title">{TITLES[tab] || ''}</div>
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
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>Contact an ops or business manager if this is unexpected.</span>
      <button onClick={signOut} style={{ marginTop: 10, padding: '10px 22px', border: 'none', borderRadius: 8, background: '#50a2ad', color: '#fff', fontSize: 14 }}>Sign Out</button>
    </div>
  )
}

function ProtectedLayout({ tabs }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar onMenu={() => setMenuOpen(true)} />
      <NavDrawer tabs={tabs} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Routes>
        {tabs.map(t => {
          const Comp = SCREEN_MAP[t]
          return Comp ? <Route key={t} path={`/${t}`} element={<Comp />} /> : null
        })}
        <Route path="*" element={<Navigate to={`/${tabs[0]}`} replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  const { session, admin, loading, tabs, recovery } = useAuth()
  if (loading) return <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span style={{ color: '#50a2ad' }}>Loading…</span></div>
  if (recovery && session) return <ResetPassword />
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (!admin || tabs.length === 0) return <NoAccount message="This login does not have admin access." />
  return <ProtectedLayout tabs={tabs} />
}
