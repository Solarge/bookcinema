import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import AdminDashboard from './AdminDashboard'
import '../../styles/admin.css'

// ── AdminLogin ──────────────────────────────────────────────────────────────
function AdminLogin() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp]         = useState('')
  const [step, setStep]         = useState('credentials') // 'credentials' | '2fa'
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit() {
    if (step === 'credentials' && (!email || !password)) return setError('Email and password required')
    if (step === '2fa' && !totp) return setError('Please enter your authenticator code')
    setLoading(true)
    setError('')
    try {
      await login(email, password, step === '2fa' ? totp : undefined)
      // After login, AdminApp re-renders based on useAuth() — no redirect needed.
    } catch (err) {
      if (err.code === '2fa_required') {
        setStep('2fa')
        setError('')
      } else if (err.code === '2fa_invalid') {
        setError('Invalid authenticator code. Please try again.')
        setTotp('')
      } else {
        setError(err.message || 'Sign-in failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="adm-center">
      <div className="adm-card">
        <div className="adm-title">BookFilm — Admin</div>
        <div className="adm-subtitle">
          {step === '2fa' ? 'Two-Factor Authentication' : 'Company Console'}
        </div>

        {error && <div role="alert" className="adm-error">{error}</div>}

        {step === 'credentials' ? (
          <>
            <input
              type="email"
              placeholder="Admin email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              aria-label="Admin email address"
              className="adm-input"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              aria-label="Admin password"
              className="adm-input"
            />
          </>
        ) : (
          <>
            <div className="adm-totp-hint">
              Enter the 6-digit code from your authenticator app.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={totp}
              onChange={e => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              aria-label="Two-factor authentication code"
              className="adm-input adm-input--totp"
            />
          </>
        )}

        <button onClick={handleSubmit} disabled={loading} className="adm-submit">
          {loading ? (step === '2fa' ? 'Verifying…' : 'Signing in…') : (step === '2fa' ? 'Verify Code' : 'Sign In')}
        </button>

        {step === '2fa' && (
          <button
            onClick={() => { setStep('credentials'); setTotp(''); setError('') }}
            className="adm-back-link"
          >
            ← Back to sign-in
          </button>
        )}

        <div className="adm-footer-note">
          Restricted to BookFilm administrators only.
        </div>
      </div>
    </div>
  )
}

// ── AccessDenied ────────────────────────────────────────────────────────────
function AccessDenied() {
  const { logout } = useAuth()
  return (
    <div className="adm-center">
      <div className="adm-card adm-card--center">
        <div className="adm-denied-title">Access Denied</div>
        <div className="adm-denied-body">
          This area is restricted to administrators.<br />
          Your account does not have admin privileges.
        </div>
        <button onClick={logout} className="adm-denied-btn">
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ── AdminApp — top-level portal component ──────────────────────────────────
export default function AdminApp() {
  const { user, loading, isAdmin, logout } = useAuth()

  if (loading) {
    return (
      <div className="adm-loading">
        <div className="adm-loading__text">Loading…</div>
      </div>
    )
  }

  if (!user) return <AdminLogin />

  if (!isAdmin) return <AccessDenied />

  // onBack repurposed as sign-out: there is no tenant home in this portal.
  return <AdminDashboard onBack={logout} />
}
