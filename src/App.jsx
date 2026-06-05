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

// ── Plan + credits billing bar ────────────────────────────────────────────────
// Shown persistently on all main pages for authenticated users.
function PlanBillingBar({ plan, creditBalance, onOpenBilling }) {
  const [busy, setBusy] = useState(false)
  const [billingMsg, setBillingMsg] = useState(null)

  // Whether the plan can be upgraded (not on studio yet)
  const canUpgrade = plan !== 'studio'
  const planName = planLabel(plan)

  // Colour hint: gold for paid plans, muted for free
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
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60,
      background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
      padding: '0 16px',
      display: 'flex', alignItems: 'center', gap: '10px', minHeight: '38px',
      flexWrap: 'wrap',
    }}>
      {/* Plan badge */}
      <span
        aria-label={`Current plan: ${planName}`}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: planColor,
          border: `1px solid ${planColor}`,
          padding: '2px 8px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {planName}
      </span>

      {/* Credit balance */}
      <span
        aria-label={creditBalance === null ? 'Credits loading' : `${creditBalance} credits remaining`}
        title="Credits consumed by managed generation (text 1, image 4–10, voice 1–5, video 10–20)"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: lowCredits ? '#f0a050' : 'var(--cream)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {creditBalance === null ? '… cr' : `${creditBalance} cr`}
        {lowCredits && <span style={{ color: '#f0a050', marginLeft: '4px' }} aria-hidden="true">⚠</span>}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1, minWidth: 0 }} />

      {/* Billing message (transient error) */}
      {billingMsg && (
        <span
          role="alert"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#f08080', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}
        >
          {billingMsg}
        </span>
      )}

      {/* Buy credits */}
      <button
        onClick={handleBuyCredits}
        disabled={busy}
        aria-label="Buy credits"
        title="Buy additional generation credits"
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          letterSpacing: '1px',
          padding: '4px 10px',
          cursor: busy ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? '…' : '+ Credits'}
      </button>

      {/* Billing CTA — always present: "Upgrade" until Studio, then "Manage Plan" */}
      <button
        onClick={onOpenBilling}
        aria-label={canUpgrade ? `Upgrade from ${planName} plan` : 'Manage your plan and billing'}
        title={canUpgrade
          ? `Upgrade to unlock ${planAllows(plan, 'voice') ? '' : 'voice, '}${planAllows(plan, 'video') ? '' : 'video, '}${planAllows(plan, 'social') ? '' : 'social '}and more`
          : 'Manage your plan and billing'}
        style={{
          background: canUpgrade ? 'var(--gold)' : 'transparent',
          color: canUpgrade ? '#080b10' : 'var(--gold)',
          border: canUpgrade ? 'none' : '1px solid var(--gold)',
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          padding: '5px 14px',
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', letterSpacing: '2px' }}>Loading…</div>
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

  const handleGenerate = useCallback(async (bookText, preset = 'cinematic') => {
    setErrorMsg(null)
    setPage('loading')
    try {
      let series
      if (settings.mode === 'managed') {
        const { jobId } = await managedApi.generateText({ bookText, genrePreset: preset, language: settings.language ?? 'en', tier: settings.managedTier || 'standard', episodeCount: settings.episodeCount ?? 7 })
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
  const topBarH = 38 // PlanBillingBar height
  const unverifiedH = isUnverified ? 36 : 0
  const homeFixedTop = topBarH + unverifiedH + 14 // extra 14px gap

  return (
    <div className="film-grain" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
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
        <div style={{ position: 'fixed', top: `${topBarH + unverifiedH + 14}px`, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--gold)', color: 'var(--cream)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '8px 16px', letterSpacing: '1px' }}>
          {inviteMsg}
          <button onClick={() => setInviteMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', marginLeft: '12px', fontSize: '14px' }}>×</button>
        </div>
      )}

      {/* Workspace switcher — home page, left side (below billing bar) */}
      {user && page === 'home' && (
        <div style={{ position: 'fixed', top: `${homeFixedTop}px`, left: '24px', zIndex: 50 }}>
          <WorkspaceSwitcher />
        </div>
      )}

      {/* User name / account button — home page, right side */}
      {user && page === 'home' && (
        <button onClick={() => { setProfileTab('profile'); setShowProfile(true) }} style={{
          position: 'fixed', top: `${homeFixedTop}px`, right: '68px', zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px', padding: '6px 12px', cursor: 'pointer', letterSpacing: '1px',
        }}>
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
