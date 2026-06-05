import { Component } from 'react'
import PropTypes from 'prop-types'
import '../styles/misc-components.css'

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
      <div className="eb-wrap">
        <div className="eb-card">
          {/* Brand */}
          <div className="eb-brand">BookFilm Studio</div>

          {/* Divider */}
          <div className="eb-divider" />

          <div className="eb-heading">Something went wrong</div>

          <p className="eb-body">
            An unexpected error occurred. Your work in progress is safe in local storage.
          </p>

          {error?.message && (
            <div className="eb-error-msg">{error.message}</div>
          )}

          <button
            onClick={() => globalThis.location.reload()}
            className="eb-reload-btn"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

ErrorBoundary.propTypes = { children: PropTypes.node.isRequired }
