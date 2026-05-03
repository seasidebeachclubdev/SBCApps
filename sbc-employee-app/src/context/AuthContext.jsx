import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchEmployee(session.user.email)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchEmployee(session.user.email)
      else { setEmployee(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchEmployee(email) {
    const { data } = await supabase.from('employees').select('*').eq('email', email).eq('active', true).single()
    setEmployee(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setEmployee(null)
  }

  return (
    <AuthContext.Provider value={{ session, employee, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
