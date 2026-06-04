import { useState, useCallback, useEffect } from 'react'
import { SettingsProvider, useSettings } from './contexts/SettingsContext'
import { MediaProvider } from './contexts/MediaContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import HomeScreen from './components/HomeScreen'
import LoadingScreen from './components/LoadingScreen'
import ResultsScreen from './components/ResultsScreen'
import LibraryScreen from './components/LibraryScreen'
import LoginPage from './components/auth/LoginPage'
import RegisterPage from './components/auth/RegisterPage'
import ForgotPasswordPage, { ResetPasswordPage } from './components/auth/ForgotPasswordPage'
import ProfilePage from './components/dashboard/ProfilePage'
import { generateSeries } from './utils/textProviders/index'
import { series as seriesApi, workspaces as workspacesApi, managed as managedApi, pollJob, auth as authApi } from './lib/api'
import WorkspaceSwitcher from './components/WorkspaceSwitcher'

// ── Small toast notification ──────────────────────────────────────────────────
function Toast({ msg, kind = 'info', onDismiss }) {
  const bg    = kind === 'error' ? '#3a0808' : '#0a2010'
  const border = kind === 'error' ? '#8a1010' : '#4a8a5a'
  const color  = kind === 'error' ? '#f08080' : '#80d898'
  return (
    <div style={{
      position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 70, background: bg, border: `1px solid ${border}`, color,
      fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
      padding: '10px 18px', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '12px',
      maxWidth: '480px', width: 'max-content',
    }}>
      <span>{msg}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

// ── Unverified-email banner ───────────────────────────────────────────────────
function UnverifiedBanner({ onResend }) {
  const [dismissed, setDismissed] = useState(false)
  const [sent, setSent]           = useState(false)
  const [busy, setBusy]           = useState(false)

  if (dismissed) return null

  async function handleResend() {
    setBusy(true)
    try { await onResend(); setSent(true) } catch (_) {}
    finally { setBusy(false) }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 65,
      background: '#1a1200', borderBottom: '1px solid #5a4010',
      padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '12px', flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#c8a040', letterSpacing: '0.5px' }}>
        {sent ? 'Verification email sent — check your inbox.' : 'Verify your email to use managed generation.'}
      </span>
      {!sent && (
        <button onClick={handleResend} disabled={busy} style={{
          background: 'none', border: '1px solid #5a4010', color: '#c8a040',
          fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
          padding: '3px 10px', cursor: busy ? 'not-allowed' : 'pointer', letterSpacing: '1px',
        }}>
          {busy ? 'Sending…' : 'Resend'}
        </button>
      )}
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: '#5a4010', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}>×</button>
    </div>
  )
}

// ── Auth gate wrapper ─────────────────────────────────────────────────────────
function AuthGate({ children }) {
  const { user, loading } = useAuth()
  // 'login' | 'register' | 'forgot' | 'reset'
  const [authView, setAuthView] = useState(() => {
    // If URL is /reset-password?token=..., go straight to reset view
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (window.location.pathname === '/reset-password' && params.get('token')) return 'reset'
    }
    return 'login'
  })

  // Derive reset token from URL once (reset view only)
  const resetToken = (() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') || ''
  })()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', letterSpacing: '2px' }}>Loading…</div>
      </div>
    )
  }

  // Not authenticated — show the appropriate auth view
  if (!user) {
    if (authView === 'register') return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    if (authView === 'forgot')   return <ForgotPasswordPage onBackToLogin={() => setAuthView('login')} />
    if (authView === 'reset')    return <ResetPasswordPage token={resetToken} onBackToLogin={() => setAuthView('login')} />
    return (
      <LoginPage
        onSwitchToRegister={() => setAuthView('register')}
        onForgotPassword={() => setAuthView('forgot')}
      />
    )
  }

  return children
}

// ── Main app (inside auth + settings contexts) ────────────────────────────────
function AppInner() {
  const { settings } = useSettings()
  const { user, switchWorkspace } = useAuth()
  const [page, setPage]                   = useState('home')
  const [uploadedText, setUploadedText]   = useState('')
  const [generatedSeries, setGeneratedSeries] = useState(null)
  const [errorMsg, setErrorMsg]           = useState(null)
  const [genrePreset, setGenrePreset]     = useState('cinematic')
  const [showProfile, setShowProfile]     = useState(false)
  const [inviteMsg, setInviteMsg]         = useState(null)
  const [toast, setToast]                 = useState(null) // { msg, kind }

  function showToast(msg, kind = 'info') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 6000)
  }

  // ── Email verify / verified URL params ──────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verify')
    const verified    = params.get('verified')

    if (verifyToken) {
      // Strip from URL immediately
      const url = new URL(window.location.href)
      url.searchParams.delete('verify')
      window.history.replaceState({}, '', url.pathname + (url.search || ''))

      authApi.verifyEmail(verifyToken)
        .then(() => showToast('Email verified — welcome to BookFilm Studio!', 'info'))
        .catch(err => showToast(`Email verification failed: ${err.message}`, 'error'))
    } else if (verified === '1') {
      // Strip from URL
      const url = new URL(window.location.href)
      url.searchParams.delete('verified')
      window.history.replaceState({}, '', url.pathname + (url.search || ''))
      showToast('Email verified successfully!', 'info')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  // Accept a workspace invite if the URL carries ?token= (invite email link).
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await workspacesApi.acceptInvite(token)
        if (cancelled) return
        if (res?.workspace?._id) await switchWorkspace(res.workspace._id)
        setInviteMsg(`Joined ${res?.workspace?.name || 'workspace'}`)
      } catch (err) {
        if (!cancelled) setInviteMsg(`Invite error: ${err.message}`)
      } finally {
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    })()
    return () => { cancelled = true }
  }, [switchWorkspace])

  const handleGenerate = useCallback(async (bookText, preset = 'cinematic') => {
    setErrorMsg(null)
    setPage('loading')
    try {
      let series
      if (settings.mode === 'managed') {
        const { jobId } = await managedApi.generateText({ bookText, genrePreset: preset, language: settings.language ?? 'en', tier: settings.managedTier || 'standard' })
        const job = await pollJob(jobId)
        if (job.status !== 'done') throw new Error(job.error || 'Managed generation failed')
        series = typeof job.result?.text === 'string' ? JSON.parse(job.result.text) : job.result?.text
        if (!series?.title) throw new Error('Empty or invalid generation result')
      } else {
        series = await generateSeries(bookText, preset, settings)
      }
      setGeneratedSeries(series)
      try {
        await seriesApi.create({
          title: series.title, author: series.author, logline: series.logline,
          genrePreset: preset, language: settings.language ?? 'en',
          textProvider: settings.mode === 'managed' ? `managed:${settings.managedTier || 'standard'}` : settings.textProvider,
          fullOutput: series,
        })
      } catch (saveErr) { console.warn('Library save failed:', saveErr) }
      setPage('results')
    } catch (err) {
      setErrorMsg(err.message || 'Generation failed. Please try again.')
      setPage('home')
    }
  }, [settings])

  const handleViewLibraryItem = useCallback((series) => { setGeneratedSeries(series); setPage('results') }, [])
  const handleNewBook = useCallback(() => { setGeneratedSeries(null); setUploadedText(''); setErrorMsg(null); setPage('home') }, [])

  // Is the logged-in user's email unverified?
  const isUnverified = user && !user.emailVerifiedAt

  return (
    <div className="film-grain" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Unverified-email banner */}
      {isUnverified && (
        <UnverifiedBanner onResend={() => authApi.resendVerification()} />
      )}

      {/* Toast notification */}
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDismiss={() => setToast(null)} />}

      {inviteMsg && (
        <div style={{ position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--gold)', color: 'var(--cream)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '8px 16px', letterSpacing: '1px' }}>
          {inviteMsg}
          <button onClick={() => setInviteMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', marginLeft: '12px', fontSize: '14px' }}>×</button>
        </div>
      )}
      {/* User badge (when logged in) */}
      {user && page === 'home' && (
        <div style={{ position: 'fixed', top: '14px', left: '24px', zIndex: 50 }}>
          <WorkspaceSwitcher />
        </div>
      )}

      {user && page === 'home' && (
        <button onClick={() => setShowProfile(true)} style={{
          position: 'fixed', top: '14px', right: '68px', zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px', padding: '6px 12px', cursor: 'pointer', letterSpacing: '1px',
        }}>
          {user.name}
        </button>
      )}

      {page === 'home' && (
        <HomeScreen onGenerate={handleGenerate} onLibrary={() => setPage('library')}
          uploadedText={uploadedText} setUploadedText={setUploadedText}
          errorMsg={errorMsg} clearError={() => setErrorMsg(null)}
          genrePreset={genrePreset} setGenrePreset={setGenrePreset} />
      )}
      {page === 'loading' && <LoadingScreen />}
      {page === 'results' && generatedSeries && (
        <MediaProvider seriesSlug={generatedSeries.title?.replace(/\s+/g, '-').toLowerCase() || 'series'}>
          <ResultsScreen series={generatedSeries} onNewBook={handleNewBook} />
        </MediaProvider>
      )}
      {page === 'library' && <LibraryScreen onView={handleViewLibraryItem} onBack={() => setPage('home')} />}

      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AuthGate>
          <AppInner />
        </AuthGate>
      </SettingsProvider>
    </AuthProvider>
  )
}
