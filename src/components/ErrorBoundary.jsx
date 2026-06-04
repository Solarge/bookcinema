import { Component } from 'react'
import PropTypes from 'prop-types'

/**
 * Top-level React error boundary.
 * Catches render / lifecycle errors and shows a branded fallback instead of
 * a white screen.  Logs details to the console (and future error-tracking).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Replace with Sentry.captureException(error, { extra: info }) once Sentry is wired
    console.error('[ErrorBoundary] Uncaught render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error } = this.state
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg, #080b10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{
          background: 'var(--surface, #12161f)',
          border: '1px solid var(--border, #2a2f3d)',
          padding: '40px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
        }}>
          {/* Brand */}
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: 'var(--gold, #c8922a)', marginBottom: '6px' }}>
            BookFilm Studio
          </div>

          {/* Divider */}
          <div style={{ width: '40px', height: '1px', background: 'var(--border, #2a2f3d)', margin: '0 auto 24px' }} />

          <div style={{ fontSize: '12px', letterSpacing: '2px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', marginBottom: '16px' }}>
            Something went wrong
          </div>

          <p style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', lineHeight: '1.7', marginBottom: '28px' }}>
            An unexpected error occurred. Your work in progress is safe in local storage.
          </p>

          {error?.message && (
            <div style={{
              background: '#3a0808',
              border: '1px solid #8a1010',
              padding: '10px 14px',
              fontSize: '10px',
              color: '#f08080',
              textAlign: 'left',
              marginBottom: '24px',
              wordBreak: 'break-word',
            }}>
              {error.message}
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--gold, #c8922a)',
              color: '#080b10',
              border: 'none',
              padding: '12px 32px',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: '600',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

ErrorBoundary.propTypes = { children: PropTypes.node.isRequired }
