import { useState, useEffect, useRef } from 'react'
import ApprovalBadge from './ApprovalBadge'
import { applyWatermark, shouldWatermark } from '../utils/watermark'
import '../styles/media-asset.css'

// Resolves the display URL for an image, applying a watermark when the plan requires it.
// Returns the original url while the watermark is being applied, then switches to the
// watermarked blob URL.  Revokes the previous object URL on cleanup to avoid memory leaks.
function useWatermarkedUrl(sourceUrl, plan) {
  const [displayUrl, setDisplayUrl] = useState(sourceUrl)
  const prevObjUrl = useRef(null)

  useEffect(() => {
    setDisplayUrl(sourceUrl) // reset immediately when source changes
    if (!sourceUrl || !shouldWatermark(plan)) {
      if (prevObjUrl.current) { URL.revokeObjectURL(prevObjUrl.current); prevObjUrl.current = null }
      return
    }
    let cancelled = false
    applyWatermark(sourceUrl, 'BookFilm Studio', plan).then(url => {
      if (cancelled) {
        if (url !== sourceUrl) { URL.revokeObjectURL(url) }
        return
      }
      if (prevObjUrl.current) { URL.revokeObjectURL(prevObjUrl.current) }
      prevObjUrl.current = url === sourceUrl ? null : url
      setDisplayUrl(url)
    })
    return () => { cancelled = true }
  }, [sourceUrl, plan])

  return displayUrl
}

// ── Cloud save/delete buttons (shared) ────────────────────────────────────
function CloudControls({ cloudEnabled, savedToCloud, saving, onSave, onDelete }) {
  if (!cloudEnabled) return null

  const isSaving = saving === 'saving'
  const isError  = typeof saving === 'string' && saving.startsWith('error:')
  const errMsg   = isError ? saving.slice(6) : null

  if (savedToCloud) {
    return (
      <div className="ma-cloud-saved-row">
        <span
          aria-label="Saved to cloud library"
          title="Saved to cloud library"
          className="ma-cloud-saved-label"
        >
          ☁ Saved
        </span>
        <button
          onClick={onDelete}
          aria-label="Remove from cloud library"
          title="Remove from cloud library"
          className="ma-cloud-btn-remove"
        >
          ✕ Remove
        </button>
      </div>
    )
  }

  return (
    <div className="ma-cloud-unsaved-col">
      <button
        onClick={onSave}
        disabled={isSaving}
        aria-label={isSaving ? 'Saving to cloud…' : 'Save to cloud library'}
        title={isSaving ? 'Saving…' : 'Save to cloud library'}
        className="ma-cloud-btn-save"
      >
        {isSaving ? '☁ …' : '☁ Save'}
      </button>
      {isError && (
        <div
          role="alert"
          title={errMsg}
          className="ma-cloud-error"
        >
          {errMsg}
        </div>
      )}
    </div>
  )
}

// ── Plan-lock overlay — shown inside asset boxes when the feature is plan-gated ─────
function PlanLockOverlay({ hint, onUpgrade }) {
  return (
    <div className="ma-lock-overlay">
      <span aria-hidden="true" className="ma-lock-icon">🔒</span>
      {hint && (
        <div className="ma-lock-hint">{hint}</div>
      )}
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          aria-label="Upgrade plan to unlock this feature"
          className="ma-lock-upgrade-btn"
        >
          Upgrade
        </button>
      )}
    </div>
  )
}

// ── ImageAsset ─────────────────────────────────────────────────────────────
export function ImageAsset({
  asset, onGenerate, onApprovalChange, label = 'Generate Image', disabled, disabledHint, plan = 'free',
  locked = false, lockedHint, onUpgrade,
  cloudEnabled = false, onSaveToCloud, onDeleteFromCloud,
}) {
  const { status, localUrl, error, approvalStatus, savedToCloud, saving, prompt } = asset ?? {}
  const displayUrl = useWatermarkedUrl(localUrl, plan)
  const altText = prompt ? `Generated: ${prompt.slice(0, 80)}` : 'AI-generated image'
  return (
    <div className="ma-asset-wrap">
      {localUrl ? (
        <div className="ma-img-container">
          <img src={displayUrl} alt={altText} className="ma-img" />
          <div className="ma-img-overlay">
            {onApprovalChange && <ApprovalBadge status={approvalStatus} onChange={onApprovalChange} />}
            <button
              onClick={onGenerate}
              disabled={status === 'generating' || disabled}
              aria-label="Regenerate image"
              className="ma-small-btn-gold"
            >↺ Regen</button>
            <CloudControls
              cloudEnabled={cloudEnabled}
              savedToCloud={savedToCloud}
              saving={saving}
              onSave={onSaveToCloud}
              onDelete={onDeleteFromCloud}
            />
          </div>
        </div>
      ) : (
        <div className={`ma-placeholder${locked ? ' is-locked' : ''}`}>
          {status === 'generating' ? (
            <GeneratingIndicator label="Generating image…" />
          ) : locked ? (
            <PlanLockOverlay hint={lockedHint} onUpgrade={onUpgrade} />
          ) : (
            <>
              {error && <div role="alert" className="ma-error-text">{error}</div>}
              <button
                onClick={onGenerate}
                disabled={disabled || status === 'generating'}
                aria-label={status === 'error' ? 'Retry image generation' : label}
                className={`ma-primary-btn${disabled ? ' is-disabled' : ''}`}
              >
                {status === 'error' ? '↺ Retry' : label}
              </button>
              {disabled && disabledHint && <div className="ma-disabled-hint">{disabledHint}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── VideoAsset ─────────────────────────────────────────────────────────────
export function VideoAsset({
  asset, onGenerate, onApprovalChange, label = 'Generate Video', disabled,
  locked = false, lockedHint, onUpgrade,
  cloudEnabled = false, onSaveToCloud, onDeleteFromCloud,
}) {
  const { status, localUrl, error, approvalStatus, savedToCloud, saving } = asset ?? {}
  return (
    <div className="ma-video-wrap">
      {localUrl ? (
        <div className="ma-video-container">
          <video src={localUrl} controls className="ma-video" />
          <div className="ma-video-controls">
            {onApprovalChange && <ApprovalBadge status={approvalStatus} onChange={onApprovalChange} />}
            <button
              onClick={onGenerate}
              disabled={status === 'generating' || disabled}
              aria-label="Regenerate video"
              className="ma-small-btn-gold"
            >↺ Regen</button>
            <a
              href={localUrl}
              download="scene.mp4"
              aria-label="Save video clip"
              className="ma-save-link"
            >⬇ Save</a>
            <CloudControls
              cloudEnabled={cloudEnabled}
              savedToCloud={savedToCloud}
              saving={saving}
              onSave={onSaveToCloud}
              onDelete={onDeleteFromCloud}
            />
          </div>
        </div>
      ) : (
        <div className={`ma-video-placeholder${locked ? ' is-locked' : ''}`}>
          {status === 'generating' ? (
            <GeneratingIndicator label="Generating video… (1–3 min)" />
          ) : locked ? (
            <PlanLockOverlay hint={lockedHint} onUpgrade={onUpgrade} />
          ) : (
            <>
              {error && <div role="alert" className="ma-error-text">{error}</div>}
              <button
                onClick={onGenerate}
                disabled={disabled || status === 'generating'}
                aria-label={status === 'error' ? 'Retry video generation' : label}
                className={`ma-primary-btn${disabled ? ' is-disabled' : ''}`}
              >
                {status === 'error' ? '↺ Retry Video' : label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── AudioAsset ─────────────────────────────────────────────────────────────
export function AudioAsset({
  asset, onGenerate, label = 'Generate Voice', disabled,
  locked = false, lockedHint, onUpgrade,
  cloudEnabled = false, onSaveToCloud, onDeleteFromCloud,
}) {
  const { status, audioUrl, error, savedToCloud, saving } = asset ?? {}
  return (
    <div className="ma-audio-wrap">
      {audioUrl ? (
        <>
          <audio src={audioUrl} controls className="ma-audio-player" />
          <button
            onClick={onGenerate}
            disabled={status === 'generating' || disabled}
            aria-label="Regenerate voice"
            className="ma-small-btn"
          >↺</button>
          <CloudControls
            cloudEnabled={cloudEnabled}
            savedToCloud={savedToCloud}
            saving={saving}
            onSave={onSaveToCloud}
            onDelete={onDeleteFromCloud}
          />
        </>
      ) : status === 'generating' ? (
        <span aria-live="polite" className="ma-audio-generating">Generating voice…</span>
      ) : locked ? (
        /* Plan-locked voice — inline since AudioAsset is in a flex row */
        <div className="ma-audio-locked">
          <span aria-hidden="true" className="ma-audio-lock-icon">🔒</span>
          {lockedHint && (
            <span className="ma-audio-lock-hint">{lockedHint}</span>
          )}
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              aria-label="Upgrade plan to unlock voice generation"
              className="ma-lock-upgrade-btn-sm"
            >Upgrade</button>
          )}
        </div>
      ) : (
        <>
          {error && <span role="alert" className="ma-audio-error">Error</span>}
          <button
            onClick={onGenerate}
            disabled={disabled}
            aria-label={label}
            className="ma-small-btn"
          >
            ▶ {label}
          </button>
        </>
      )}
    </div>
  )
}

function GeneratingIndicator({ label }) {
  return (
    <>
      <div className="ma-spinner" aria-hidden="true" />
      <span aria-live="polite" className="ma-spinner-label">{label}</span>
    </>
  )
}
