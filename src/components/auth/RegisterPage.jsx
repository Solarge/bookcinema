import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'
import { TermsOfService, PrivacyPolicy } from '../legal/LegalPages'

export default function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth()
  const [name, setName]                   = useState('')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [consent, setConsent]             = useState(false)
  const [ageConfirmed, setAgeConfirmed]   = useState(false)
  const [marketingConsent, setMarketing]  = useState(false)
  const [error, setError]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [legalOpen, setLegalOpen]         = useState(null) // null | 'terms' | 'privacy'

  async function handleSubmit() {
    if (!name || !email || !password) return setError('All fields required')
    if (password.length < 12) return setError('Password must be at least 12 characters')
    if (!consent) return setError('You must agree to the Terms of Service and Privacy Policy')
    if (!ageConfirmed) return setError('You must confirm you are 16 years or older')
    setLoading(true); setError('')
    try { await register(name, email, password, true, ageConfirmed, marketingConsent) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const isDisabled = loading || !consent || !ageConfirmed

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">BookFilm Studio</div>
        <div className="auth-subtitle">CREATE ACCOUNT</div>

        {error && <div role="alert" className="auth-error">{error}</div>}

        <input type="text"     placeholder="Full name"      value={name}     onChange={e => setName(e.target.value)}     aria-label="Full name"     className="auth-input" autoFocus />
        <input type="email"    placeholder="Email address"  value={email}    onChange={e => setEmail(e.target.value)}    aria-label="Email address" className="auth-input" />
        <input type="password" placeholder="Password (min 12 chars)" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} aria-label="Password (minimum 12 characters)" className="auth-input" />

        {/* ToS + Privacy consent checkbox */}
        <label className="auth-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span className="auth-consent-text">
            I agree to the{' '}
            <button type="button" onClick={e => { e.preventDefault(); setLegalOpen('terms') }} className="auth-inline-link">Terms of Service</button>
            {' '}and{' '}
            <button type="button" onClick={e => { e.preventDefault(); setLegalOpen('privacy') }} className="auth-inline-link">Privacy Policy</button>
          </span>
        </label>

        {/* Age confirmation — REQUIRED */}
        <label className="auth-consent">
          <input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)} />
          <span className="auth-consent-text">
            I confirm I am <span className="ds-cream">16 years or older</span>
          </span>
        </label>

        {/* Marketing consent — optional */}
        <label className="auth-consent auth-consent-last">
          <input type="checkbox" checked={marketingConsent} onChange={e => setMarketing(e.target.checked)} />
          <span className="auth-consent-text">
            Send me product updates and tips <span style={{ color: '#4a5a6a' }}>(optional)</span>
          </span>
        </label>

        <button onClick={handleSubmit} disabled={isDisabled} className="auth-submit">
          {loading ? 'Creating account…' : 'Create Account'}
        </button>

        <div className="auth-center" style={{ marginTop: '16px' }}>
          <button onClick={onSwitchToLogin} className="auth-link">Already have an account? Sign in</button>
        </div>
      </div>

      {legalOpen === 'terms'   && <TermsOfService onClose={() => setLegalOpen(null)} />}
      {legalOpen === 'privacy' && <PrivacyPolicy  onClose={() => setLegalOpen(null)} />}
    </div>
  )
}

RegisterPage.propTypes = { onSwitchToLogin: PropTypes.func.isRequired }
