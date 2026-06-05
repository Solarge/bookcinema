import { useState, useRef } from 'react'
import { parsePdf } from '../utils/pdfParser'
import { checkContentSafety } from '../utils/contentSafety'
import { GENRE_PRESETS } from '../utils/genrePresets'
import SettingsPanel from './SettingsPanel'
import Onboarding from './Onboarding'
import '../styles/home.css'

const COPYRIGHT_ACK_KEY = 'bookfilm_copyright_ack'
const ONBOARDED_KEY     = 'bookfilm_onboarded'
const LARGE_TEXT_CHARS  = 80_000

export default function HomeScreen({
  onGenerate, onLibrary,
  uploadedText, setUploadedText,
  errorMsg, clearError,
  genrePreset, setGenrePreset,
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
  // First-run onboarding — show once per browser, then re-openable via the link.
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDED_KEY))

  function closeOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, '1')
    setShowOnboarding(false)
  }

  // Copyright acknowledgement — one-time, persisted
  const [copyrightAck, setCopyrightAck] = useState(() => !!localStorage.getItem(COPYRIGHT_ACK_KEY))

  function handleCopyrightAck(checked) {
    setCopyrightAck(checked)
    if (checked) localStorage.setItem(COPYRIGHT_ACK_KEY, '1')
    else localStorage.removeItem(COPYRIGHT_ACK_KEY)
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
    onGenerate(text, genrePreset, copyrightAck)
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
    <div className="home-screen">

      {/* Settings gear — top right */}
      <button
        onClick={() => setShowSettings(true)}
        title="Generation Settings"
        className="home-gear-btn"
      >⚙</button>

      {/* Header */}
      <div className="home-header">
        <div className="home-eyebrow">AI Production Studio</div>
        <h1 className="home-title">BookFilm Studio</h1>
        <p className="home-tagline">
          Turn any book into a cinematic movie series — no editing skills needed
        </p>
        <div className="home-howit">
          How it works: add a book → we write the script → one click makes the movie
        </div>
        <button
          type="button"
          onClick={() => setShowOnboarding(true)}
          className="home-howit-link"
        >
          ❓ How it works
        </button>
      </div>

      <div className="home-content">

        {/* Error banner */}
        {errorMsg && (
          <div className="home-error-banner">
            <span className="home-error-text">{errorMsg}</span>
            <button onClick={clearError} className="home-error-close">×</button>
          </div>
        )}

        {/* Safety warning */}
        {safetyWarning && (
          <div className="home-safety-warning">
            ⚠ {safetyWarning}
          </div>
        )}

        {/* Genre preset selector */}
        <div className="home-genre-section">
          <div className="home-genre-label">Genre / Style</div>
          <div className="home-genre-pills">
            {Object.entries(GENRE_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setGenrePreset(key)}
                className={`home-genre-pill${genrePreset === key ? ' is-active' : ''}`}
              >
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
            className={`home-dropzone${dragOver ? ' is-drag-over' : ''}`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" className="home-file-input" onChange={e => handleFile(e.target.files[0])} />
            {pdfStatus === 'reading' ? (
              <>
                <div className="home-dropzone-spinner">⟳</div>
                <div className="home-dropzone-progress">{pdfProgress}</div>
              </>
            ) : pdfStatus === 'done' ? (
              <>
                <div className="home-dropzone-check">✓</div>
                <div className="home-dropzone-filename">{pdfName}</div>
                <div className="home-dropzone-extracted">{pdfProgress}</div>
              </>
            ) : pdfStatus === 'error' ? (
              <>
                <div className="home-dropzone-error-msg">{pdfProgress}</div>
                <div className="home-dropzone-retry-hint">Click to try another file</div>
              </>
            ) : (
              <>
                <div className="home-dropzone-icon">📄</div>
                <div className="home-dropzone-title">Drop your book here to begin</div>
                <div className="home-dropzone-hint">or click to choose a PDF from your device</div>
              </>
            )}
          </div>
        )}

        {/* Toggle text fallback */}
        <div className={`home-toggle-row${showTextFallback ? ' has-margin' : ''}`}>
          <button onClick={() => setShowTextFallback(v => !v)} className="home-toggle-btn">
            {showTextFallback ? '← Back to PDF upload' : "No PDF? Type or paste your story instead"}
          </button>
        </div>

        {/* Text fallback */}
        {showTextFallback && (
          <div className="home-text-fallback">
            <input
              type="text"
              placeholder="Book title"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              className="home-fallback-title-input"
            />
            <textarea
              placeholder="Describe the book — plot, key characters, themes, tone (300–500 words recommended)"
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={7}
              className="home-fallback-textarea"
            />
          </div>
        )}

        {/* Large-text warning (non-blocking) */}
        {showLargeTextWarning && (
          <div className="home-large-text-warning">
            Large input ({currentTextLength.toLocaleString()} chars) — generation may be slower or hit provider token limits. Consider using a condensed excerpt.
          </div>
        )}

        {/* Copyright acknowledgement — required once, persisted */}
        {!copyrightAck && (
          <label className="home-copyright-label">
            <input
              type="checkbox"
              checked={copyrightAck}
              onChange={e => handleCopyrightAck(e.target.checked)}
              className="home-copyright-checkbox"
            />
            <span className="home-copyright-text">
              I confirm I have the rights to use this text, or it is in the public domain.
            </span>
          </label>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`home-generate-btn${canGenerate ? ' can-generate' : ''}`}
        >
          Generate Cinematic Series
        </button>

        {/* Library link */}
        <div className="home-library-row">
          <button onClick={onLibrary} className="home-library-btn">
            My Library →
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {showOnboarding && <Onboarding open onClose={closeOnboarding} />}
    </div>
  )
}
