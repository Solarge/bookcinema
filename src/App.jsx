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
import ProfilePage from './components/dashboard/ProfilePage'
import { generateSeries } from './utils/textProviders/index'
import { series as seriesApi, workspaces as workspacesApi, managed as managedApi, pollJob } from './lib/api'
import WorkspaceSwitcher from './components/WorkspaceSwitcher'

// ── Auth gate wrapper ─────────────────────────────────────────────────────────
function AuthGate({ children }) {
  const { user, loading } = useAuth()
  const [authView, setAuthView] = useState('login') // 'login' | 'register'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', letterSpacing: '2px' }}>Loading…</div>
      </div>
    )
  }

  // Not authenticated — show login/register
  if (!user) {
    if (authView === 'register') return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} onForgotPassword={() => {}} />
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

  return (
    <div className="film-grain" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
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
          👤 {user.name}
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
