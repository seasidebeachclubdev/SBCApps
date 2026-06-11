import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function ResetPassword() {
  const { updatePassword, clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    const err = await updatePassword(password)
    if (err) { setError(err.message || 'Could not update password'); setSaving(false); return }
    clearRecovery()
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">🔑</div>
      <div className="login-title">Set New Password</div>
      <div className="login-sub">Choose a new password for your account.</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Password'}</button>
      </form>
    </div>
  )
}
