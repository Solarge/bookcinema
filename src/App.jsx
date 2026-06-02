import { useState, useCallback } from 'react'
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
import { storage } from './utils/storage'

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
    const USE_AUTH = import.meta.env.VITE_USE_AUTH === 'true'
    if (!USE_AUTH) return children // Auth optional — skip if VITE_USE_AUTH != 'true'

    if (authView === 'register') return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} onForgotPassword={() => {}} />
  }

  return children
}

// ── Main app (inside auth + settings contexts) ────────────────────────────────
function AppInner() {
  const { settings } = useSettings()
  const { user } = useAuth()
  const [page, setPage]                   = useState('home')
  const [uploadedText, setUploadedText]   = useState('')
  const [generatedSeries, setGeneratedSeries] = useState(null)
  const [errorMsg, setErrorMsg]           = useState(null)
  const [genrePreset, setGenrePreset]     = useState('cinematic')
  const [showProfile, setShowProfile]     = useState(false)

  const handleGenerate = useCallback(async (bookText, preset = 'cinematic') => {
    setErrorMsg(null)
    setPage('loading')
    try {
      const series = await generateSeries(bookText, preset, settings)
      setGeneratedSeries(series)
      try {
        storage.set(`series:${Date.now()}`, JSON.stringify({
          title: series.title, author: series.author, logline: series.logline,
          generatedAt: new Date().toISOString(), fullOutput: series,
        }))
      } catch (storageErr) { console.warn('Library save failed:', storageErr) }
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
      {/* User badge (when logged in) */}
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
