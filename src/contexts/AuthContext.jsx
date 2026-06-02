import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { auth as authApi, users as usersApi, setAccessToken, clearAccessToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [loading, setLoading]   = useState(true)  // initial auth check

  // On mount — try to refresh session from httpOnly cookie
  useEffect(() => {
    authApi.refresh()
      .then(({ accessToken }) => {
        setAccessToken(accessToken)
        return usersApi.me()
      })
      .then(u => setUser(u))
      .catch(() => { clearAccessToken(); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  // Listen for auto-logout events (from api.js 401 handler)
  useEffect(() => {
    const handler = () => { setUser(null); clearAccessToken() }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password })
    setAccessToken(data.accessToken)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (name, email, password) => {
    const data = await authApi.register({ name, email, password })
    setAccessToken(data.accessToken)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch (_) {}
    clearAccessToken()
    setUser(null)
  }, [])

  const updateUser = useCallback((patch) => {
    setUser(prev => ({ ...prev, ...patch }))
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout, updateUser, isAdmin: user?.role === 'admin' }), [user, loading, login, register, logout, updateUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired }

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
