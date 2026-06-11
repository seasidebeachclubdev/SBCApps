import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Tab access by role — matches handoff doc exactly
export const ROLE_TABS = {
  gate_device:      ['gate', 'members', 'fees'],
  ops_manager:      ['overview', 'gate', 'members', 'fees', 'employees', 'payroll', 'comms', 'issues'],
  business_manager: ['overview', 'gate', 'members', 'fees', 'employees', 'payroll', 'comms', 'issues', 'reports'],
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchAdmin(session.user.email)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (!session) { setAdmin(null); setLoading(false); return }
      // fetch on sign-in only; token refreshes keep the already-loaded profile
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setLoading(true)
        fetchAdmin(session.user.email)
      }
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchAdmin(email) {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email)
      .in('role', ['gate_device', 'ops_manager', 'business_manager'])
      .single()
    setAdmin(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setAdmin(null)
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    return error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    return error
  }

  const clearRecovery = () => setRecovery(false)

  const tabs = admin ? (ROLE_TABS[admin.role] || []) : []

  return (
    <AuthContext.Provider value={{ session, admin, loading, recovery, signIn, signOut, tabs, resetPassword, updatePassword, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
