import { useNavigate, useLocation } from 'react-router-dom'

export default function NavBar({ tabs }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="bottom-nav">
      {tabs.map(tab => (
        <div
          key={tab.path}
          className={`nav-item ${location.pathname === tab.path ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="icon">{tab.icon}</span>
          <span className="label">{tab.label}</span>
        </div>
      ))}
    </div>
  )
}
