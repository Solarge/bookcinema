import { useState } from 'react'
import PropTypes from 'prop-types'
import { auth as authApi } from '../../lib/api'

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
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">BookFilm Studio</div>
        <div className="auth-subtitle">RESET PASSWORD</div>

        {error && <div role="alert" className="auth-error">{error}</div>}
        {success && <div role="status" aria-live="polite" className="auth-success">{success}</div>}

        {!success && (
          <>
            <p className="auth-hint">
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
              className="auth-input"
            />
            <button onClick={handleSubmit} disabled={loading} className="auth-submit">
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </>
        )}

        <div className="auth-center">
          <button onClick={onBackToLogin} className="auth-link">← Back to Sign In</button>
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
    if (password.length < 12) return setError('Password must be at least 12 characters')
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
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">BookFilm Studio</div>
        <div className="auth-subtitle">SET NEW PASSWORD</div>

        {error && <div role="alert" className="auth-error">{error}</div>}
        {success && <div role="status" aria-live="polite" className="auth-success">{success}</div>}

        {!success && (
          <>
            <input
              type="password"
              placeholder="New password (min 12 chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              aria-label="New password (minimum 12 characters)"
              className="auth-input"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              aria-label="Confirm new password"
              className="auth-input"
            />
            <button onClick={handleSubmit} disabled={loading} className="auth-submit">
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </>
        )}

        <div className="auth-center">
          <button onClick={onBackToLogin} className="auth-link">← Back to Sign In</button>
        </div>
      </div>
    </div>
  )
}

ResetPasswordPage.propTypes = {
  token: PropTypes.string.isRequired,
  onBackToLogin: PropTypes.func.isRequired,
}
