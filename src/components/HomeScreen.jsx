import { useState, useRef } from 'react'
import { parsePdf } from '../utils/pdfParser'
import { checkContentSafety } from '../utils/contentSafety'
import { GENRE_PRESETS } from '../utils/genrePresets'
import SettingsPanel from './SettingsPanel'

const COPYRIGHT_ACK_KEY = 'bookfilm_copyright_ack'
const BYO_NOTICE_KEY    = 'bookfilm_byo_notice_dismissed'
const LARGE_TEXT_CHARS  = 80_000

export default function HomeScreen({
  onGenerate, onLibrary,
  uploadedText, setUploadedText,
  errorMsg, clearError,
  genrePreset, setGenrePreset,
  useAuth: useAuthProp,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [pdfStatus, setPdfStatus] = useState(null)
  const [pdfProgress, setPdfProgress] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [showTextFallback, setShowTextFallback] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualText, setManualText] = useState('')
  const [safetyWarning, setSafetyWarning] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // Copyright acknowledgement — one-time, persisted
  const [copyrightAck, setCopyrightAck] = useState(() => !!localStorage.getItem(COPYRIGHT_ACK_KEY))
  const [byoNoticeDismissed, setByoNoticeDismissed] = useState(() => !!localStorage.getItem(BYO_NOTICE_KEY))

  // Check if we're in BYO (non-auth) mode
  const isAuthMode = typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_AUTH === 'true'

  function handleCopyrightAck(checked) {
    setCopyrightAck(checked)
    if (checked) localStorage.setItem(COPYRIGHT_ACK_KEY, '1')
    else localStorage.removeItem(COPYRIGHT_ACK_KEY)
  }

  function dismissByoNotice() {
    setByoNoticeDismissed(true)
    localStorage.setItem(BYO_NOTICE_KEY, '1')
  }

  const fileInputRef = useRef(null)

  async function handleFile(file) {
    if (!file || !file.name.endsWith('.pdf')) return
    setPdfName(file.name)
    setPdfStatus('reading')
    setPdfProgress('Starting…')
    clearError()
    setSafetyWarning(null)
    try {
      const text = await parsePdf(file, setPdfProgress)
      const safety = checkContentSafety(text)
      if (!safety.safe) {
        setPdfStatus('error')
        setPdfProgress(safety.message)
        setShowTextFallback(true)
        return
      }
      if (safety.level === 'warning') setSafetyWarning(safety.message)
      setUploadedText(text)
      setPdfStatus('done')
      setPdfProgress(`${text.length.toLocaleString()} characters extracted`)
    } catch (err) {
      setPdfStatus('error')
      setPdfProgress(err.message || 'Failed to read PDF')
      setShowTextFallback(true)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  function handleGenerate() {
    const text = showTextFallback || pdfStatus !== 'done'
      ? `Title: ${manualTitle}\n\n${manualText}`
      : uploadedText
    if (!text.trim()) return
    if (!copyrightAck) return
    const safety = checkContentSafety(text)
    if (!safety.safe) { setSafetyWarning(safety.message); return }
    onGenerate(text, genrePreset)
  }

  const hasContent = (pdfStatus === 'done' && uploadedText) ||
    (showTextFallback && manualTitle && manualText)
  const canGenerate = hasContent && copyrightAck

  // Large-text warning (non-blocking)
  const currentTextLength = showTextFallback
    ? (manualText || '').length
    : (uploadedText || '').length
  const showLargeTextWarning = currentTextLength > LARGE_TEXT_CHARS

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

      {/* Settings gear — top right */}
      <button
        onClick={() => setShowSettings(true)}
        title="Settings & API Keys"
        style={{
          position: 'fixed', top: '16px', right: '20px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', width: '38px', height: '38px',
          fontSize: '18px', cursor: 'pointer', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >⚙</button>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '16px' }}>AI Production Studio</div>
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: '700', color: 'var(--gold)', letterSpacing: '-0.5px', lineHeight: '1.1', marginBottom: '16px' }}>BookFilm Studio</h1>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '20px', color: 'var(--muted)', maxWidth: '480px', margin: '0 auto' }}>
          Turn any book into a cinematic AI video series
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: '640px' }}>

        {/* Error banner */}
        {errorMsg && (
          <div style={{ background: '#3a0808', border: '1px solid var(--red)', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#f08080' }}>{errorMsg}</span>
            <button onClick={clearError} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>
        )}

        {/* BYO data-loss notice (non-auth mode only, one-time dismissable) */}
        {!isAuthMode && !byoNoticeDismissed && (
          <div style={{ background: '#0d1a0d', border: '1px solid #2a5a2a', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6dc87a', lineHeight: '1.6' }}>
              Your work is saved locally in this browser — export regularly to avoid losing it if you clear storage.
            </span>
            <button onClick={dismissByoNotice} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* Safety warning */}
        {safetyWarning && (
          <div style={{ background: '#201800', border: '1px solid #ffd166', padding: '10px 16px', marginBottom: '16px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#ffd166' }}>
            ⚠ {safetyWarning}
          </div>
        )}

        {/* Genre preset selector */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Genre / Style</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(GENRE_PRESETS).map(([key, preset]) => (
              <button key={key} onClick={() => setGenrePreset(key)} style={{
                background: genrePreset === key ? 'rgba(200,146,42,0.12)' : 'transparent',
                border: `1px solid ${genrePreset === key ? 'var(--gold)' : 'var(--border)'}`,
                color: genrePreset === key ? 'var(--gold)' : 'var(--muted)',
                padding: '5px 12px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                letterSpacing: '1px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {preset.emoji} {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {!showTextFallback && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? 'var(--gold)' : '#8a6420'}`,
              background: dragOver ? 'rgba(200,146,42,0.05)' : 'var(--surface)',
              padding: '44px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '16px',
              transition: 'all 0.2s',
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {pdfStatus === 'reading' ? (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '24px', marginBottom: '10px', animation: 'spin-reel 2s linear infinite', display: 'inline-block' }}>⟳</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--gold)' }}>{pdfProgress}</div>
              </>
            ) : pdfStatus === 'done' ? (
              <>
                <div style={{ fontSize: '28px', marginBottom: '10px', color: '#6dc87a' }}>✓</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: 'var(--gold)', marginBottom: '4px' }}>{pdfName}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6dc87a' }}>{pdfProgress}</div>
              </>
            ) : pdfStatus === 'error' ? (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#f08080', marginBottom: '8px' }}>{pdfProgress}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>Click to try another file</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '36px', marginBottom: '14px', opacity: 0.3 }}>📄</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: 'var(--cream)', marginBottom: '6px' }}>Drop your book PDF here</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)' }}>or click to browse — accepts .pdf</div>
              </>
            )}
          </div>
        )}

        {/* Toggle text fallback */}
        <div style={{ textAlign: 'center', marginBottom: showTextFallback ? '16px' : '0' }}>
          <button onClick={() => setShowTextFallback(v => !v)} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '2px', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', padding: '8px 0' }}>
            {showTextFallback ? '← Back to PDF upload' : 'Or describe your book instead'}
          </button>
        </div>

        {/* Text fallback */}
        {showTextFallback && (
          <div style={{ marginBottom: '16px' }}>
            <input type="text" placeholder="Book title" value={manualTitle} onChange={e => setManualTitle(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'Cinzel', serif", fontSize: '16px', padding: '12px 16px', marginBottom: '10px', outline: 'none' }} />
            <textarea placeholder="Describe the book — plot, key characters, themes, tone (300–500 words recommended)" value={manualText} onChange={e => setManualText(e.target.value)} rows={7}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'Cormorant Garamond', serif", fontSize: '16px', padding: '14px 16px', resize: 'vertical', outline: 'none', lineHeight: '1.7' }} />
          </div>
        )}

        {/* Large-text warning (non-blocking) */}
        {showLargeTextWarning && (
          <div style={{ background: '#201800', border: '1px solid #806020', padding: '9px 14px', marginBottom: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#c8a040', lineHeight: '1.5' }}>
            Large input ({currentTextLength.toLocaleString()} chars) — generation may be slower or hit provider token limits. Consider using a condensed excerpt.
          </div>
        )}

        {/* Copyright acknowledgement — required once, persisted */}
        {!copyrightAck && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 14px' }}>
            <input
              type="checkbox"
              checked={copyrightAck}
              onChange={e => handleCopyrightAck(e.target.checked)}
              style={{ marginTop: '2px', accentColor: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6' }}>
              I confirm I have the rights to use this text, or it is in the public domain.
            </span>
          </label>
        )}

        {/* Generate button */}
        <button onClick={handleGenerate} disabled={!canGenerate} style={{
          display: 'block', width: '100%',
          background: canGenerate ? 'var(--gold)' : 'var(--border)',
          color: canGenerate ? '#080b10' : 'var(--muted)',
          border: 'none', padding: '18px',
          fontFamily: "'Cinzel', serif", fontSize: '14px', fontWeight: '600',
          letterSpacing: '3px', textTransform: 'uppercase',
          cursor: canGenerate ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
          marginBottom: '16px',
        }}>
          Generate Cinematic Series
        </button>

        {/* Library link */}
        <div style={{ textAlign: 'center' }}>
          <button onClick={onLibrary} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '2px', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}>
            My Library →
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
