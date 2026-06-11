import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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
const ICONS  = { overview: '⌂', gate: '🚪', members: '👥', fees: '💳', employees: '👷', payroll: '💰', comms: '📢', issues: '⚑', reports: '📊' }

function NavBar({ tabs }) {
  const location = useLocation()
  const tab = location.pathname.slice(1)
  return (
    <div className="bottom-nav" style={{ overflowX: 'auto' }}>
      {tabs.map(t => (
        <div key={t} className={`nav-item ${tab === t ? 'active' : ''}`} style={{ minWidth: 52 }} onClick={() => window.location.href = `/${t}`}>
          <span className="icon">{ICONS[t]}</span>
          <span className="label">{TITLES[t]}</span>
        </div>
      ))}
    </div>
  )
}

function TopBar({ tabs }) {
  const { admin } = useAuth()
  const location = useLocation()
  const tab = location.pathname.slice(1)
  const roleLabel = { gate_device: 'Gate Device', ops_manager: 'Ops Manager', business_manager: 'Business Mgr' }[admin?.role] || ''
  return (
    <div className="top-bar">
      <div className="top-bar-sub">{roleLabel} · admin.sbcri.com</div>
      <div className="top-bar-title">{TITLES[tab] || ''}</div>
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar tabs={tabs} />
      <Routes>
        {tabs.map(t => {
          const Comp = SCREEN_MAP[t]
          return Comp ? <Route key={t} path={`/${t}`} element={<Comp />} /> : null
        })}
        <Route path="*" element={<Navigate to={`/${tabs[0]}`} replace />} />
      </Routes>
      <NavBar tabs={tabs} />
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
