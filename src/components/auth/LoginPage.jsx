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
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: 'var(--gold)', marginBottom: '8px', textAlign: 'center' }}>BookFilm Studio</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '28px' }}>SIGN IN</div>

        {error && <div style={errorStyle}>{error}</div>}

        <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus
          style={inputStyle} />
        <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={inputStyle} />

        <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          <button onClick={onSwitchToRegister} style={linkBtn}>Create account</button>
          <button onClick={onForgotPassword}   style={linkBtn}>Forgot password?</button>
        </div>

        <LegalLinks />
      </div>
    </div>
  )
}

LoginPage.propTypes = { onSwitchToRegister: PropTypes.func.isRequired, onForgotPassword: PropTypes.func.isRequired }

const containerStyle = { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', padding: '40px', width: '100%', maxWidth: '420px' }
const inputStyle = { display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', padding: '12px 14px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }
const btnStyle = (loading) => ({ display: 'block', width: '100%', background: loading ? 'var(--border)' : 'var(--gold)', color: loading ? 'var(--muted)' : '#080b10', border: 'none', padding: '13px', fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' })
const errorStyle = { background: '#3a0808', border: '1px solid var(--red)', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#f08080', marginBottom: '16px' }
const linkBtn = { background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }
