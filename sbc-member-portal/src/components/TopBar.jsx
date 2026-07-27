import { useAuth } from '../context/AuthContext'

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

export default function TopBar({ subtitle, title }) {
  const { signOut } = useAuth()
  return (
    <div className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div>
        <div className="top-bar-sub">{subtitle}</div>
        <div className="top-bar-title">{title}</div>
      </div>
      <button onClick={signOut} style={signOutStyle}>Sign Out</button>
    </div>
  )
}
