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
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: 'var(--gold)', marginBottom: '6px', textAlign: 'center', letterSpacing: '2px' }}>
          BookFilm — Admin
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '32px', textTransform: 'uppercase' }}>
          {step === '2fa' ? 'Two-Factor Authentication' : 'Company Console'}
        </div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

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
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '14px', lineHeight: '1.6' }}>
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
              style={{ ...inputStyle, letterSpacing: '6px', fontSize: '18px', textAlign: 'center' }}
            />
          </>
        )}

        <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
          {loading ? (step === '2fa' ? 'Verifying…' : 'Signing in…') : (step === '2fa' ? 'Verify Code' : 'Sign In')}
        </button>

        {step === '2fa' && (
          <button
            onClick={() => { setStep('credentials'); setTotp(''); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', cursor: 'pointer', marginTop: '12px', width: '100%', textAlign: 'center', letterSpacing: '1px' }}
          >
            ← Back to sign-in
          </button>
        )}

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
