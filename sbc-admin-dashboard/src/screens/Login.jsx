import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await signIn(email.trim().toLowerCase(), password)
    if (err) setError('Invalid credentials')
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">📋</div>
      <div className="login-title">SBC Admin</div>
      <div style={{ fontSize: 13, color: '#6b6b6b', textAlign: 'center' }}>admin.sbcri.com · Authorized staff only</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <input type="email" placeholder="Staff email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}
