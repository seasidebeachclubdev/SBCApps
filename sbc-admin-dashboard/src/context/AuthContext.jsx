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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchAdmin(session.user.email)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchAdmin(session.user.email)
      else { setAdmin(null); setLoading(false) }
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

  const tabs = admin ? (ROLE_TABS[admin.role] || []) : []

  return (
    <AuthContext.Provider value={{ session, admin, loading, signIn, signOut, tabs }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
