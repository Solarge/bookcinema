import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { auth as authApi, users as usersApi, workspaces as workspacesApi, setAccessToken, clearAccessToken, setActiveWorkspace } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [loading, setLoading]   = useState(true)  // initial auth check
  const [activeWorkspace, setActiveWorkspaceState] = useState(null)
  const [activeWorkspacePlan, setActiveWorkspacePlan] = useState('free')
  const [activeCreditBalance, setActiveCreditBalance] = useState(null) // null = not yet loaded

  /**
   * seedActiveWorkspace — fetches the workspace list once and resolves the
   * correct active workspace, self-healing any stale defaultWorkspaceId.
   *
   * Rules:
   *   1. Use defaultWorkspaceId if it's present in the list.
   *   2. Else fall back to the first workspace in the list.
   *   3. Else null (new account with no workspace yet).
   *
   * Called on bootstrap, login, and register — never on every render.
   */
  const seedActiveWorkspace = useCallback(async (u) => {
    if (!u) {
      setActiveWorkspace(null)
      setActiveWorkspaceState(null)
      setActiveWorkspacePlan('free')
      setActiveCreditBalance(null)
      return
    }
    try {
      const list = await workspacesApi.list()
      const defaultId = u.defaultWorkspaceId?.toString?.() ?? u.defaultWorkspaceId

      // Prefer defaultWorkspaceId if it appears in the list; else fall back to first.
      const found = list.find(w =>
        w._id === defaultId || w._id?.toString() === defaultId
      ) ?? list[0] ?? null

      const chosenId = found?._id ?? null

      setActiveWorkspace(chosenId)
      setActiveWorkspaceState(chosenId)
      setActiveWorkspacePlan(found?.plan || 'free')
      setActiveCreditBalance(found?.creditBalance ?? null)

      // If the resolved workspace differs from defaultWorkspaceId, persist the
      // correction server-side (best-effort — don't throw on failure).
      if (chosenId && chosenId !== defaultId) {
        workspacesApi.switch(chosenId).catch(() => {})
      }
    } catch (_) {
      // Network failure — fall back to the stale defaultWorkspaceId if present,
      // with unknown plan. Better than leaving the user locked out entirely.
      const fallback = u.defaultWorkspaceId ?? null
      setActiveWorkspace(fallback)
      setActiveWorkspaceState(fallback)
      setActiveWorkspacePlan('free')
      setActiveCreditBalance(null)
    }
  }, [])

  // On mount — try to refresh session from httpOnly cookie
  useEffect(() => {
    authApi.refresh()
      .then(({ accessToken }) => {
        setAccessToken(accessToken)
        return usersApi.me()
      })
      .then(u => {
        setUser(u)
        return seedActiveWorkspace(u)
      })
      .catch(() => { clearAccessToken(); setUser(null) })
      .finally(() => setLoading(false))
  }, [seedActiveWorkspace])

  // Listen for auto-logout events (from api.js 401 handler)
  useEffect(() => {
    const handler = () => {
      setUser(null)
      clearAccessToken()
      setActiveWorkspace(null)
      setActiveWorkspaceState(null)
      setActiveWorkspacePlan('free')
      setActiveCreditBalance(null)
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password })
    setAccessToken(data.accessToken)
    setUser(data.user)
    await seedActiveWorkspace(data.user)
    return data.user
  }, [seedActiveWorkspace])

  const register = useCallback(async (name, email, password, consent, ageConfirmed = false, marketingConsent = false) => {
    const data = await authApi.register({ name, email, password, consent, ageConfirmed, marketingConsent })
    setAccessToken(data.accessToken)
    setUser(data.user)
    await seedActiveWorkspace(data.user)
    return data.user
  }, [seedActiveWorkspace])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch (_) {}
    clearAccessToken()
    setUser(null)
    setActiveWorkspace(null)
    setActiveWorkspaceState(null)
    setActiveWorkspacePlan('free')
    setActiveCreditBalance(null)
  }, [])

  const updateUser = useCallback((patch) => {
    setUser(prev => ({ ...prev, ...patch }))
  }, [])

  const switchWorkspace = useCallback(async (workspaceId) => {
    await workspacesApi.switch(workspaceId)
    setActiveWorkspace(workspaceId)
    setActiveWorkspaceState(workspaceId)
    // Re-resolve plan + credits from the list for the newly switched workspace
    try {
      const list = await workspacesApi.list()
      const found = list.find(w => w._id === workspaceId || w._id?.toString() === workspaceId?.toString())
      setActiveWorkspacePlan(found?.plan || 'free')
      setActiveCreditBalance(found?.creditBalance ?? null)
    } catch (_) {
      setActiveWorkspacePlan('free')
      setActiveCreditBalance(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, activeWorkspace, activeWorkspacePlan, activeCreditBalance, login, register, logout, updateUser, switchWorkspace, isAdmin: user?.role === 'admin' }), [user, loading, activeWorkspace, activeWorkspacePlan, activeCreditBalance, login, register, logout, updateUser, switchWorkspace])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired }

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
