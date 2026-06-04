import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import AdminDashboard from './AdminDashboard'

// ── Minimal styles shared across admin portal screens ──────────────────────
const wrapStyle = {
  minHeight: '100vh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  padding: '48px 40px',
  width: '100%',
  maxWidth: '440px',
}

const inputStyle = {
  display: 'block',
  width: '100%',
  background: '#0a0806',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '13px',
  padding: '12px 14px',
  outline: 'none',
  marginBottom: '12px',
  boxSizing: 'border-box',
}

const btnStyle = (disabled) => ({
  display: 'block',
  width: '100%',
  background: disabled ? 'var(--border)' : 'var(--gold)',
  color: disabled ? 'var(--muted)' : '#080b10',
  border: 'none',
  padding: '13px',
  fontFamily: "'Cinzel', serif",
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginTop: '4px',
})

const errorStyle = {
  background: '#3a0808',
  border: '1px solid #804040',
  padding: '10px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  color: '#f08080',
  marginBottom: '16px',
}

// ── AdminLogin ──────────────────────────────────────────────────────────────
function AdminLogin() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit() {
    if (!email || !password) return setError('Email and password required')
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      // After login, AdminApp re-renders based on useAuth() — no redirect needed.
    } catch (err) {
      setError(err.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: 'var(--gold)', marginBottom: '6px', textAlign: 'center', letterSpacing: '2px' }}>
          BookFilm — Admin
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '32px', textTransform: 'uppercase' }}>
          Company Console
        </div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        <input
          type="email"
          placeholder="Admin email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoFocus
          aria-label="Admin email address"
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          aria-label="Admin password"
          style={inputStyle}
        />

        <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textAlign: 'center', marginTop: '24px', letterSpacing: '1px' }}>
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
    <div style={wrapStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#f08080', letterSpacing: '2px', marginBottom: '16px' }}>
          Access Denied
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', marginBottom: '28px' }}>
          This area is restricted to administrators.<br />
          Your account does not have admin privileges.
        </div>
        <button
          onClick={logout}
          style={{
            background: 'transparent',
            border: '1px solid #804040',
            color: '#f08080',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            padding: '10px 24px',
            cursor: 'pointer',
          }}
        >
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', letterSpacing: '2px' }}>
          Loading…
        </div>
      </div>
    )
  }

  if (!user) return <AdminLogin />

  if (!isAdmin) return <AccessDenied />

  // onBack repurposed as sign-out: there is no tenant home in this portal.
  return <AdminDashboard onBack={logout} />
}
