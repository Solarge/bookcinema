import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'

export default function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit() {
    if (!name || !email || !password) return setError('All fields required')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    setLoading(true); setError('')
    try { await register(name, email, password) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', color: 'var(--gold)', marginBottom: '8px', textAlign: 'center' }}>BookFilm Studio</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '3px', textAlign: 'center', marginBottom: '28px' }}>CREATE ACCOUNT</div>

        {error && <div style={errorStyle}>{error}</div>}

        <input type="text"     placeholder="Full name"      value={name}     onChange={e => setName(e.target.value)}     style={inputStyle} autoFocus />
        <input type="email"    placeholder="Email address"  value={email}    onChange={e => setEmail(e.target.value)}    style={inputStyle} />
        <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={inputStyle} />

        <button onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button onClick={onSwitchToLogin} style={linkBtn}>Already have an account? Sign in</button>
        </div>
      </div>
    </div>
  )
}

RegisterPage.propTypes = { onSwitchToLogin: PropTypes.func.isRequired }

const containerStyle = { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', padding: '40px', width: '100%', maxWidth: '420px' }
const inputStyle = { display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', padding: '12px 14px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }
const btnStyle = (l) => ({ display: 'block', width: '100%', background: l ? 'var(--border)' : 'var(--gold)', color: l ? 'var(--muted)' : '#080b10', border: 'none', padding: '13px', fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: l ? 'not-allowed' : 'pointer', marginTop: '4px' })
const errorStyle = { background: '#3a0808', border: '1px solid var(--red)', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#f08080', marginBottom: '16px' }
const linkBtn = { background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }
