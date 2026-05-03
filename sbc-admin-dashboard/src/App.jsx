import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './screens/Login'
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
  const { session, loading, tabs } = useAuth()
  if (loading) return <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span style={{ color: '#50a2ad' }}>Loading…</span></div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  return <ProtectedLayout tabs={tabs} />
}
