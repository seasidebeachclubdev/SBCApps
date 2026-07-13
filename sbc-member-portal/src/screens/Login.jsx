import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const linkStyle = { background: 'none', border: 'none', color: '#50a2ad', fontSize: 13, cursor: 'pointer', padding: 4 }

export default function Login() {
  const { signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('signin') // 'signin' | 'forgot' | 'sent' | 'claim' | 'claim-sent'
  const [claim, setClaim] = useState({ first: '', last: '', plate: '', email: '', phone: '' })

  async function handleClaim(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: fnError } = await supabase.functions.invoke('claim-account', {
      body: {
        first_name: claim.first,
        last_name: claim.last,
        license_plate: claim.plate,
        email: claim.email,
        phone: claim.phone,
      },
    })
    setLoading(false)
    if (fnError) { setError('Could not submit the request. Please try again.'); return }
    setView('claim-sent')
  }

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

  if (view === 'claim' || view === 'claim-sent') {
    return (
      <div className="login-wrap">
        <div className="login-logo">🏖️</div>
        <div className="login-title">Claim Your Account</div>
        <div className="login-sub">Member Portal · members.sbcri.com</div>
        {view === 'claim-sent' ? (
          <div className="login-form">
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
              Thanks! The club will review your request. Once approved, an email will arrive
              at <strong>{claim.email}</strong> with a link to set your password.
            </div>
            <button type="button" className="btn-primary" onClick={() => setView('signin')}>Back to Sign In</button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleClaim}>
            <div style={{ fontSize: 12, color: '#6b6b6b', textAlign: 'center', lineHeight: 1.5 }}>
              We'll match you against the club roster. Use the last name your membership
              is under and a license plate registered with the club.
            </div>
            <input type="text" placeholder="First name" value={claim.first} onChange={e => setClaim({ ...claim, first: e.target.value })} autoComplete="given-name" />
            <input type="text" placeholder="Last name (on the membership)" value={claim.last} onChange={e => setClaim({ ...claim, last: e.target.value })} required autoComplete="family-name" />
            <input type="text" placeholder="License plate (e.g. RI AB123)" value={claim.plate} onChange={e => setClaim({ ...claim, plate: e.target.value })} required />
            <input type="email" placeholder="Your email" value={claim.email} onChange={e => setClaim({ ...claim, email: e.target.value })} required autoComplete="email" />
            <input type="tel" placeholder="Phone (optional)" value={claim.phone} onChange={e => setClaim({ ...claim, phone: e.target.value })} autoComplete="tel" />
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Submitting…' : 'Request Access'}
            </button>
            <button type="button" onClick={() => { setError(''); setView('signin') }} style={linkStyle}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    )
  }

  if (view !== 'signin') {
    return (
      <div className="login-wrap">
        <div className="login-logo">🏖️</div>
        <div className="login-title">Reset Password</div>
        <div className="login-sub">Member Portal · members.sbcri.com</div>
        {view === 'sent' ? (
          <div className="login-form">
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, a password reset link is on its way. Check your inbox.
            </div>
            <button type="button" className="btn-primary" onClick={() => setView('signin')}>Back to Sign In</button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleForgot}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => { setError(''); setView('signin') }} style={linkStyle}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">🏖️</div>
      <div className="login-title">Seaside Beach Club</div>
      <div className="login-sub">Member Portal · members.sbcri.com</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
        <button type="button" onClick={() => { setError(''); setView('forgot') }} style={linkStyle}>
          Forgot password?
        </button>
        <button type="button" onClick={() => { setError(''); setView('claim') }} style={linkStyle}>
          First season on the portal? Claim your account
        </button>
      </form>
    </div>
  )
}
