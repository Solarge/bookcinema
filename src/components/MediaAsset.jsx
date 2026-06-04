import { useState, useEffect, useRef } from 'react'
import ApprovalBadge from './ApprovalBadge'
import { applyWatermark, shouldWatermark } from '../utils/watermark'

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

export function ImageAsset({ asset, onGenerate, onApprovalChange, label = 'Generate Image', disabled, disabledHint, plan = 'free' }) {
  const { status, localUrl, error, approvalStatus, prompt } = asset ?? {}
  const displayUrl = useWatermarkedUrl(localUrl, plan)
  const altText = prompt ? `Generated: ${prompt.slice(0, 80)}` : 'AI-generated image'
  return (
    <div style={{ marginBottom: '12px' }}>
      {localUrl ? (
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <img src={displayUrl} alt={altText} style={{ width: '100%', maxWidth: '300px', display: 'block', border: '1px solid var(--border)' }} />
          <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
            {onApprovalChange && <ApprovalBadge status={approvalStatus} onChange={onApprovalChange} />}
            <button onClick={onGenerate} disabled={status === 'generating' || disabled} aria-label="Regenerate image" style={smallBtn('#c8922a', '#080b10')}>↺ Regen</button>
          </div>
        </div>
      ) : (
        <div style={{
          width: '100%',
          maxWidth: '300px',
          height: '200px',
          background: 'var(--surface2)',
          border: '1px dashed var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}>
          {status === 'generating' ? (
            <GeneratingIndicator label="Generating image…" />
          ) : (
            <>
              {error && <div role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f08080', textAlign: 'center', padding: '0 12px' }}>{error}</div>}
              <button onClick={onGenerate} disabled={disabled || status === 'generating'} aria-label={status === 'error' ? 'Retry image generation' : label} style={primaryBtn(disabled)}>
                {status === 'error' ? '↺ Retry' : label}
              </button>
              {disabled && disabledHint && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textAlign: 'center', padding: '0 12px' }}>{disabledHint}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function VideoAsset({ asset, onGenerate, onApprovalChange, label = 'Generate Video', disabled }) {
  const { status, localUrl, error, approvalStatus } = asset ?? {}
  return (
    <div style={{ marginBottom: '12px' }}>
      {localUrl ? (
        <div style={{ position: 'relative' }}>
          <video src={localUrl} controls style={{ width: '100%', maxWidth: '400px', display: 'block', border: '1px solid var(--border)', background: '#000' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
            {onApprovalChange && <ApprovalBadge status={approvalStatus} onChange={onApprovalChange} />}
            <button onClick={onGenerate} disabled={status === 'generating' || disabled} aria-label="Regenerate video" style={smallBtn('#c8922a', '#080b10')}>↺ Regen</button>
            <a href={localUrl} download="scene.mp4" aria-label="Save video clip" style={{ ...smallBtn('#1e2d3d', 'var(--muted)'), textDecoration: 'none', display: 'inline-block' }}>⬇ Save</a>
          </div>
        </div>
      ) : (
        <div style={{
          width: '100%',
          maxWidth: '400px',
          height: '100px',
          background: 'var(--surface2)',
          border: '1px dashed var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          {status === 'generating' ? (
            <GeneratingIndicator label="Generating video… (1–3 min)" />
          ) : (
            <>
              {error && <div role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f08080', padding: '0 12px', textAlign: 'center' }}>{error}</div>}
              <button onClick={onGenerate} disabled={disabled || status === 'generating'} aria-label={status === 'error' ? 'Retry video generation' : label} style={primaryBtn(disabled)}>
                {status === 'error' ? '↺ Retry Video' : label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function AudioAsset({ asset, onGenerate, label = 'Generate Voice', disabled }) {
  const { status, audioUrl, error } = asset ?? {}
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
      {audioUrl ? (
        <>
          <audio src={audioUrl} controls style={{ height: '28px', flex: 1, minWidth: '180px' }} />
          <button onClick={onGenerate} disabled={status === 'generating' || disabled} aria-label="Regenerate voice" style={smallBtn('var(--border)', 'var(--muted)')}>↺</button>
        </>
      ) : status === 'generating' ? (
        <span aria-live="polite" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>Generating voice…</span>
      ) : (
        <>
          {error && <span role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f08080' }}>Error</span>}
          <button onClick={onGenerate} disabled={disabled} aria-label={label} style={smallBtn('var(--border)', 'var(--muted)')}>
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
      <div style={{ width: '20px', height: '20px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-reel 1s linear infinite' }} aria-hidden="true" />
      <span aria-live="polite" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>{label}</span>
    </>
  )
}

function primaryBtn(disabled) {
  return {
    background: disabled ? 'var(--border)' : 'var(--gold)',
    color: disabled ? 'var(--muted)' : '#080b10',
    border: 'none',
    padding: '7px 14px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function smallBtn(border, color) {
  return {
    background: 'transparent',
    border: `1px solid ${border}`,
    color,
    padding: '4px 8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    cursor: 'pointer',
    letterSpacing: '1px',
  }
}
