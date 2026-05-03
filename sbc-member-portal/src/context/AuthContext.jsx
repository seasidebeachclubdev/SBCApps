import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchMember(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchMember(session.user.id)
      else { setMember(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchMember(userId) {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('auth_user_id', userId)
      .single()

    if (!error) setMember(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMember(null)
  }

  return (
    <AuthContext.Provider value={{ session, member, loading, signIn, signOut, setMember }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
