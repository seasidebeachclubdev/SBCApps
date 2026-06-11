import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const linkStyle = { background: 'none', border: 'none', color: '#50a2ad', fontSize: 13, cursor: 'pointer', padding: 4 }

export default function Login() {
  const { signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('signin') // 'signin' | 'forgot' | 'sent'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await signIn(email.trim().toLowerCase(), password)
    if (err) setError('Invalid email or password')
    setLoading(false)
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await resetPassword(email.trim().toLowerCase())
    setLoading(false)
    if (err) { setError('Could not send reset email. Please try again.'); return }
    setView('sent')
  }

  if (view !== 'signin') {
    return (
      <div className="login-wrap">
        <div className="login-logo">🏊</div>
        <div className="login-title">Reset Password</div>
        <div style={{ fontSize: 13, color: '#6b6b6b', textAlign: 'center' }}>staff.sbcri.com · Employees only</div>
        {view === 'sent' ? (
          <div className="login-form">
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, a password reset link is on its way. Check your inbox.
            </div>
            <button type="button" className="btn-primary" onClick={() => setView('signin')}>Back to Sign In</button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleForgot}>
            <input type="email" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Sending…' : 'Send Reset Link'}</button>
            <button type="button" onClick={() => { setError(''); setView('signin') }} style={linkStyle}>Back to sign in</button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">🏊</div>
      <div className="login-title">SBC Staff App</div>
      <div style={{ fontSize: 13, color: '#6b6b6b', textAlign: 'center' }}>staff.sbcri.com · Employees only</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <input type="email" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
        <button type="button" onClick={() => { setError(''); setView('forgot') }} style={linkStyle}>Forgot password?</button>
      </form>
    </div>
  )
}
