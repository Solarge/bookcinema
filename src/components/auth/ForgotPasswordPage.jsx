import { useState } from 'react'
import PropTypes from 'prop-types'
import { auth as authApi } from '../../lib/api'

// ── Shared styles (mirror LoginPage aesthetic) ────────────────────────────────
const containerStyle = { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', padding: '40px', width: '100%', maxWidth: '420px' }
const inputStyle = { display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', padding: '12px 14px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }
const btnStyle = (disabled) => ({ display: 'block', width: '100%', background: disabled ? 'var(--border)' : 'var(--gold)', color: disabled ? 'var(--muted)' : '#080b10', border: 'none', padding: '13px', fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', marginTop: '4px' })
const errorStyle = { background: '#3a0808', border: '1px solid var(--red)', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#f08080', marginBottom: '16px' }
const successStyle = { background: '#0a2010', border: '1px solid #4a8a5a', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#80d898', marginBottom: '16px' }
const linkBtn = { background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }

// ── Forgot-password (request reset) ──────────────────────────────────────────
export default function ForgotPasswordPage({ onBackToLogin }) {
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email) return setError('Email address required')
    setLoading(true); setError(''); setSuccess('')
    try {
      await authApi.forgotPassword(email)
      setSuccess('If that email is registered, a reset link has been sent. Check your inbox.')
    } catch (err) {
      // Server returns a non-error response even for unknown emails to prevent enumeration;
      // only surface a message if the network/server itself fails.
      setError(err.message || 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: 'var(--gold)', marginBottom: '8px', textAlign: 'center' }}>BookFilm Studio</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '28px' }}>RESET PASSWORD</div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}
        {success && <div role="status" aria-live="polite" style={successStyle}>{success}</div>}

        {!success && (
          <>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.6' }}>
              Enter your account email and we'll send you a link to reset your password.
            </p>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              aria-label="Email address"
              style={inputStyle}
            />
            <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={onBackToLogin} style={linkBtn}>← Back to Sign In</button>
        </div>
      </div>
    </div>
  )
}

ForgotPasswordPage.propTypes = { onBackToLogin: PropTypes.func.isRequired }

// ── Reset-password (enter new password using token from email link) ───────────
export function ResetPasswordPage({ token, onBackToLogin }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit() {
    if (!password) return setError('New password required')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setLoading(true); setError(''); setSuccess('')
    try {
      await authApi.resetPassword(token, password)
      setSuccess('Password reset successfully. You can now sign in with your new password.')
    } catch (err) {
      setError(err.message || 'Reset failed. The link may have expired — request a new one.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: 'var(--gold)', marginBottom: '8px', textAlign: 'center' }}>BookFilm Studio</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '28px' }}>SET NEW PASSWORD</div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}
        {success && <div role="status" aria-live="polite" style={successStyle}>{success}</div>}

        {!success && (
          <>
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              aria-label="New password (minimum 8 characters)"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              aria-label="Confirm new password"
              style={inputStyle}
            />
            <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={onBackToLogin} style={linkBtn}>← Back to Sign In</button>
        </div>
      </div>
    </div>
  )
}

ResetPasswordPage.propTypes = {
  token: PropTypes.string.isRequired,
  onBackToLogin: PropTypes.func.isRequired,
}
