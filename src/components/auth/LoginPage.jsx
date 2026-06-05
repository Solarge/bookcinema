import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'
import { LegalLinks } from '../legal/LegalPages'

export default function LoginPage({ onSwitchToRegister, onForgotPassword }) {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit() {
    if (!email || !password) return setError('Email and password required')
    setLoading(true); setError('')
    try { await login(email, password) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">BookFilm Studio</div>
        <div className="auth-subtitle">SIGN IN</div>

        {error && <div role="alert" className="auth-error">{error}</div>}

        <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus
          aria-label="Email address"
          className="auth-input" />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          aria-label="Password"
          className="auth-input" />

        <button onClick={handleSubmit} disabled={loading} className="auth-submit">
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="auth-links-row">
          <button onClick={onSwitchToRegister} className="auth-link">Create account</button>
          <button onClick={onForgotPassword}   className="auth-link">Forgot password?</button>
        </div>

        <LegalLinks />
      </div>
    </div>
  )
}

LoginPage.propTypes = { onSwitchToRegister: PropTypes.func.isRequired, onForgotPassword: PropTypes.func.isRequired }
