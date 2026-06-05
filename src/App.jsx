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
import LandingPage from './components/marketing/LandingPage'
import ProfilePage from './components/dashboard/ProfilePage'
import PublicSeriesView from './components/PublicSeriesView'
import { generateSeries } from './utils/textProviders/index'
import { series as seriesApi, workspaces as workspacesApi, managed as managedApi, pollJob, auth as authApi, billing as billingApi } from './lib/api'
import WorkspaceSwitcher from './components/WorkspaceSwitcher'
import { planLabel, planAllows } from './utils/plans'
import './styles/app.css'

// ── Small toast notification ──────────────────────────────────────────────────
function Toast({ msg, kind = 'info', onDismiss }) {
  return (
    <div className={`app-toast app-toast--${kind}`}>
      <span>{msg}</span>
      <button onClick={onDismiss} className="app-toast__dismiss">×</button>
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
    <div className="app-unverified">
      <span className="app-unverified__text">
        {sent ? 'Verification email sent — check your inbox.' : 'Verify your email to use managed generation.'}
      </span>
      {!sent && (
        <button onClick={handleResend} disabled={busy} className="app-unverified__resend">
          {busy ? 'Sending…' : 'Resend'}
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="app-unverified__close">×</button>
    </div>
  )
}

// ── Plan + credits billing bar ────────────────────────────────────────────────
// Shown persistently on all main pages for authenticated users.
function PlanBillingBar({ plan, creditBalance, onOpenBilling }) {
  const [busy, setBusy] = useState(false)
  const [billingMsg, setBillingMsg] = useState(null)

  // Whether the plan can be upgraded (not on studio yet)
  const canUpgrade = plan !== 'studio'
  const planName = planLabel(plan)

  // Colour hint: gold for paid plans, muted for free — dynamic, kept inline
  const isPaid = plan === 'pro' || plan === 'studio'
  const planColor = isPaid ? 'var(--gold)' : 'var(--muted)'

  // Low-credit warning threshold
  const lowCredits = creditBalance !== null && creditBalance <= 10

  async function handleBuyCredits() {
    setBusy(true); setBillingMsg(null)
    try {
      const { url } = await billingApi.checkout({ kind: 'pack', key: 'pack_small' })
      window.location.href = url
    } catch (err) {
      if (err.status === 503 || err.status === 404) {
        setBillingMsg('Billing is not configured yet — contact support.')
      } else {
        setBillingMsg(err.message || 'Billing unavailable right now.')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="app-billing-bar">
      {/* Plan badge — color/border are dynamic (depends on plan tier) */}
      <span
        aria-label={`Current plan: ${planName}`}
        className="app-billing-bar__plan-badge"
        style={{ color: planColor, border: `1px solid ${planColor}` }}
      >
        {planName}
      </span>

      {/* Credit balance — color is dynamic (low-credit warning) */}
      <span
        aria-label={creditBalance === null ? 'Credits loading' : `${creditBalance} credits remaining`}
        title="Credits consumed by managed generation (text 1, image 4–10, voice 1–5, video 10–20)"
        className="app-billing-bar__credits"
        style={{ color: lowCredits ? '#f0a050' : 'var(--cream)' }}
      >
        {creditBalance === null ? '… cr' : `${creditBalance} cr`}
        {lowCredits && <span className="app-billing-bar__credits-warn" aria-hidden="true">⚠</span>}
      </span>

      {/* Spacer */}
      <div className="app-billing-bar__spacer" />

      {/* Billing message (transient error) */}
      {billingMsg && (
        <span role="alert" className="app-billing-bar__msg">{billingMsg}</span>
      )}

      {/* Buy credits */}
      <button
        onClick={handleBuyCredits}
        disabled={busy}
        aria-label="Buy credits"
        title="Buy additional generation credits"
        className="app-billing-bar__buy"
      >
        {busy ? '…' : '+ Credits'}
      </button>

      {/* Billing CTA — background/color/border are dynamic (plan-dependent), keep inline */}
      <button
        onClick={onOpenBilling}
        aria-label={canUpgrade ? `Upgrade from ${planName} plan` : 'Manage your plan and billing'}
        title={canUpgrade
          ? `Upgrade to unlock ${planAllows(plan, 'voice') ? '' : 'voice, '}${planAllows(plan, 'video') ? '' : 'video, '}${planAllows(plan, 'social') ? '' : 'social '}and more`
          : 'Manage your plan and billing'}
        className="app-billing-bar__upgrade"
        style={{
          background: canUpgrade ? 'var(--gold)' : 'transparent',
          color: canUpgrade ? '#080b10' : 'var(--gold)',
          border: canUpgrade ? 'none' : '1px solid var(--gold)',
        }}
      >
        {canUpgrade ? 'Upgrade' : 'Manage Plan'}
      </button>
    </div>
  )
}

// ── Auth gate wrapper ─────────────────────────────────────────────────────────
function AuthGate({ children }) {
  const { user, loading } = useAuth()
  // 'landing' | 'login' | 'register' | 'forgot' | 'reset'
  const [authView, setAuthView] = useState(() => {
    // If URL is /reset-password?token=..., go straight to reset view
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (window.location.pathname === '/reset-password' && params.get('token')) return 'reset'
    }
    // Default: show the public landing page to logged-out visitors
    return 'landing'
  })

  // Derive reset token from URL once (reset view only)
  const resetToken = (() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') || ''
  })()

  if (loading) {
    return (
      <div className="app-auth-loading">
        <div className="app-auth-loading__text">Loading…</div>
      </div>
    )
  }

  // Not authenticated — show the appropriate auth view
  if (!user) {
    if (authView === 'landing')  return (
      <LandingPage
        onGetStarted={() => setAuthView('register')}
        onSignIn={() => setAuthView('login')}
      />
    )
    if (authView === 'register') return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    if (authView === 'forgot')   return <ForgotPasswordPage onBackToLogin={() => setAuthView('login')} />
    if (authView === 'reset')    return <ResetPasswordPage token={resetToken} onBackToLogin={() => setAuthView('login')} />
    return (
      <LoginPage
        onSwitchToRegister={() => setAuthView('register')}
        onForgotPassword={() => setAuthView('forgot')}
        onBackToLanding={() => setAuthView('landing')}
      />
    )
  }

  return children
}

// ── Main app (inside auth + settings contexts) ────────────────────────────────
function AppInner() {
  const { settings } = useSettings()
  const { user, switchWorkspace, activeWorkspacePlan, activeCreditBalance } = useAuth()
  const [page, setPage]                   = useState('home')
  const [uploadedText, setUploadedText]   = useState('')
  const [generatedSeries, setGeneratedSeries] = useState(null)
  const [generatedSeriesId, setGeneratedSeriesId] = useState(null) // MongoDB _id after save
  const [errorMsg, setErrorMsg]           = useState(null)
  const [genrePreset, setGenrePreset]     = useState('cinematic')
  const [showProfile, setShowProfile]     = useState(false)
  const [profileTab, setProfileTab]       = useState('profile') // which tab to open ProfilePage on
  const [inviteMsg, setInviteMsg]         = useState(null)
  const [toast, setToast]                 = useState(null) // { msg, kind }

  // Open ProfilePage to billing/workspace tab (used by upgrade CTAs)
  const openBilling = useCallback(() => { setProfileTab('workspace'); setShowProfile(true) }, [])

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

    // Social OAuth callback: ?social=connected&platform=X
    const socialStatus   = params.get('social')
    const socialPlatform = params.get('platform')
    if (socialStatus === 'connected') {
      const url = new URL(window.location.href)
      url.searchParams.delete('social')
      url.searchParams.delete('platform')
      window.history.replaceState({}, '', url.pathname + (url.search || ''))
      const label = socialPlatform ? socialPlatform.charAt(0).toUpperCase() + socialPlatform.slice(1) : 'Social account'
      showToast(`${label} connected successfully`, 'info')
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

  const handleGenerate = useCallback(async (bookText, preset = 'cinematic', rightsConfirmed = false) => {
    setErrorMsg(null)
    setPage('loading')
    try {
      let series
      if (settings.mode === 'managed') {
        const { jobId } = await managedApi.generateText({ bookText, genrePreset: preset, language: settings.language ?? 'en', tier: settings.managedTier || 'standard', episodeCount: settings.episodeCount ?? 'auto', rightsConfirmed })
        const job = await pollJob(jobId)
        if (job.status !== 'done') throw new Error(job.error || 'Managed generation failed')
        series = typeof job.result?.text === 'string' ? JSON.parse(job.result.text) : job.result?.text
        if (!series?.title) throw new Error('Empty or invalid generation result')
      } else {
        series = await generateSeries(bookText, preset, settings)
      }
      setGeneratedSeries(series)
      setGeneratedSeriesId(null)
      try {
        const saved = await seriesApi.create({
          title: series.title, author: series.author, logline: series.logline,
          genrePreset: preset, language: settings.language ?? 'en',
          textProvider: settings.mode === 'managed' ? `managed:${settings.managedTier || 'standard'}` : settings.textProvider,
          fullOutput: series,
        })
        if (saved?._id) setGeneratedSeriesId(saved._id)
      } catch (saveErr) { console.warn('Library save failed:', saveErr) }
      setPage('results')
    } catch (err) {
      setErrorMsg(err.message || 'Generation failed. Please try again.')
      setPage('home')
    }
  }, [settings])

  const handleViewLibraryItem = useCallback((seriesData, seriesId) => { setGeneratedSeries(seriesData); setGeneratedSeriesId(seriesId || null); setPage('results') }, [])
  const handleNewBook = useCallback(() => { setGeneratedSeries(null); setGeneratedSeriesId(null); setUploadedText(''); setErrorMsg(null); setPage('home') }, [])

  // Is the logged-in user's email unverified?
  const isUnverified = user && !user.emailVerifiedAt

  // The billing bar is always 38px; unverified banner adds ~36px on top of that.
  // Home-page workspace switcher + user name button sit below those fixed bars.
  // These offsets are DYNAMIC (computed at runtime) — kept as inline styles.
  const topBarH = 38 // PlanBillingBar height
  const unverifiedH = isUnverified ? 36 : 0
  const homeFixedTop = topBarH + unverifiedH + 14 // extra 14px gap

  return (
    <div className="film-grain app-root">
      {/* Persistent plan/credits/billing bar — always shown when authed */}
      {user && (
        <PlanBillingBar
          plan={activeWorkspacePlan || 'free'}
          creditBalance={activeCreditBalance}
          onOpenBilling={openBilling}
        />
      )}

      {/* Unverified-email banner (below the billing bar) */}
      {isUnverified && (
        <div style={{ marginTop: `${topBarH}px` }}>
          <UnverifiedBanner onResend={() => authApi.resendVerification()} />
        </div>
      )}

      {/* Toast notification */}
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDismiss={() => setToast(null)} />}

      {inviteMsg && (
        <div
          className="app-invite"
          style={{ top: `${topBarH + unverifiedH + 14}px` }}
        >
          {inviteMsg}
          <button onClick={() => setInviteMsg(null)} className="app-invite__close">×</button>
        </div>
      )}

      {/* Workspace switcher — home page, left side (below billing bar) */}
      {user && page === 'home' && (
        <div className="app-ws-wrapper" style={{ top: `${homeFixedTop}px` }}>
          <WorkspaceSwitcher />
        </div>
      )}

      {/* User name / account button — home page, right side */}
      {user && page === 'home' && (
        <button
          onClick={() => { setProfileTab('profile'); setShowProfile(true) }}
          className="app-user-btn"
          style={{ top: `${homeFixedTop}px` }}
        >
          {user.name}
        </button>
      )}

      {/* Main page content — pad top to clear the billing bar (+ unverified banner) */}
      <div style={{ paddingTop: `${topBarH + unverifiedH}px` }}>
        {page === 'home' && (
          <HomeScreen onGenerate={handleGenerate} onLibrary={() => setPage('library')}
            uploadedText={uploadedText} setUploadedText={setUploadedText}
            errorMsg={errorMsg} clearError={() => setErrorMsg(null)}
            genrePreset={genrePreset} setGenrePreset={setGenrePreset} />
        )}
        {page === 'loading' && <LoadingScreen />}
        {page === 'results' && generatedSeries && (
          <MediaProvider
            seriesSlug={generatedSeries.title?.replace(/\s+/g, '-').toLowerCase() || 'series'}
            seriesId={generatedSeriesId}
          >
            <ResultsScreen
              series={generatedSeries}
              seriesId={generatedSeriesId}
              onNewBook={handleNewBook}
              onOpenBilling={openBilling}
            />
          </MediaProvider>
        )}
        {page === 'library' && <LibraryScreen onView={handleViewLibraryItem} onBack={() => setPage('home')} />}
      </div>

      {showProfile && (
        <ProfilePage
          onClose={() => setShowProfile(false)}
          initialTab={profileTab}
        />
      )}
    </div>
  )
}

// Detect a public share token from the URL — must bypass AuthGate entirely.
function getShareTokenFromUrl() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('share') || null
}

export default function App() {
  // Check for ?share= before rendering anything auth-related.
  const shareToken = getShareTokenFromUrl()
  if (shareToken) {
    return (
      <SettingsProvider>
        <PublicSeriesView token={shareToken} />
      </SettingsProvider>
    )
  }

  // Normal tenant app. (The admin console is a SEPARATE build — admin.html /
  // src/admin-main.jsx — and is not part of this tenant bundle.)
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
