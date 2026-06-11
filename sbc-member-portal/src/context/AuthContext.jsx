import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchMember(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (!session) { setMember(null); setLoading(false); return }
      // fetch on sign-in only; token refreshes keep the already-loaded profile
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setLoading(true)
        fetchMember(session.user.id)
      }
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
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

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    return error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    return error
  }

  const clearRecovery = () => setRecovery(false)

  return (
    <AuthContext.Provider value={{ session, member, loading, recovery, signIn, signOut, setMember, resetPassword, updatePassword, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
