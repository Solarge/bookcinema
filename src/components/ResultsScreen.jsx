import { useState, useCallback, useEffect, useRef } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useMedia } from '../contexts/MediaContext'
import { useAuth } from '../contexts/AuthContext'
import { exportHtml } from '../utils/exportHtml'
import { exportZip } from '../utils/zipExport'
import { generateSeriesBibleHtml } from '../utils/seriesBible'
import { saveAs } from 'file-saver'
import { estimateBatchCost, totalCost } from '../utils/costTracker'
import { ImageAsset, VideoAsset, AudioAsset } from './MediaAsset'
import SettingsPanel from './SettingsPanel'
import StoryboardView from './StoryboardView'
import SocialCardModal from './SocialCardModal'
import { useDivModalA11y } from '../hooks/useModalA11y'
import { series as seriesApi, managed as managedApi, pollJob } from '../lib/api'
import { planAllows, minPlanFor, planLabel, FEATURE_LABELS } from '../utils/plans'
import '../styles/results.css'

// Whether generation is possible for a media kind given current settings.
// In managed mode: plan-gated (voice/video require pro+). Image+text always allowed.
// Legacy BYO-key path preserved for non-managed settings.
const KEYLESS_PROVIDERS = { image: ['comfyui', 'a1111'], voice: ['kokoro', 'xtts'], video: ['localvideo'] }
const PROVIDER_KEY_REMAP = { 'fal.ai': 'falai', openaitts: 'openai' }

/**
 * Returns { allowed: bool, reason: 'plan'|'key'|null, requiredPlan?: string }
 * In managed mode the plan is the gate; in BYO mode the API key is the gate.
 */
function canGenerateInfo(settings, kind, provider, plan) {
  // Plan gate (managed-only mode)
  if (settings.mode === 'managed') {
    if (!planAllows(plan, kind)) {
      return { allowed: false, reason: 'plan', requiredPlan: minPlanFor(kind) }
    }
    return { allowed: true, reason: null }
  }
  // BYO / hybrid: keyless local providers always work
  if ((KEYLESS_PROVIDERS[kind] || []).includes(provider)) return { allowed: true, reason: null }
  const keyName = PROVIDER_KEY_REMAP[provider] || provider
  if (settings.apiKeys?.[keyName]) return { allowed: true, reason: null }
  return { allowed: false, reason: 'key' }
}

// Short hint shown when a generate button is disabled.
function genHint(kind, provider, plan, reason) {
  if (reason === 'plan') {
    const req = minPlanFor(kind)
    return `Upgrade to ${planLabel(req)} to use ${FEATURE_LABELS[kind] || kind}.`
  }
  const managed = kind === 'image' || kind === 'voice'
  return `No ${provider} API key set — add one in Settings ⚙${managed ? ', or switch to Managed mode' : ''}.`
}

// ── Editable field ─────────────────────────────────────────────────────────
function Editable({ value, onChange, multiline, style, displayStyle }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])

  if (editing) {
    const props = {
      value: local,
      onChange: e => setLocal(e.target.value),
      onBlur: () => { onChange(local); setEditing(false) },
      onKeyDown: e => { if (!multiline && e.key === 'Enter') { onChange(local); setEditing(false) } if (e.key === 'Escape') setEditing(false) },
      autoFocus: true,
      className: `rs-editable-input${multiline ? ' rs-editable-textarea' : ''}`,
      style,
    }
    return multiline ? <textarea rows={4} {...props} /> : <input {...props} />
  }

  return (
    <span onClick={() => setEditing(true)} title="Click to edit" className="rs-editable-display" style={displayStyle}>
      {value || <span className="rs-editable-placeholder">Click to edit…</span>}
    </span>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="rs-copy-btn"
      style={{ border: `1px solid ${copied ? '#3a7a4a' : 'var(--border)'}`, color: copied ? '#6dc87a' : 'var(--muted)' }}>
      {copied ? '✓ Copied!' : label}
    </button>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('protagonist')) return 'var(--char-protagonist)'
  if (r.includes('antagonist'))  return 'var(--char-antagonist)'
  if (r.includes('love'))        return 'var(--char-love)'
  if (r.includes('ally'))        return 'var(--char-ally)'
  return 'var(--char-supporting)'
}
function charColor(id, chars) { return roleColor(chars.find(c => c.id === id)?.role) }
function charName(id, chars)  { return chars.find(c => c.id === id)?.name || id }

// ── Character Bible ────────────────────────────────────────────────────────
function CharacterBible({ characters, seriesTitle, onUpdateChar, plan = 'free', onOpenBilling }) {
  const { settings } = useSettings()
  const { characters: charMedia, generateCharacterImage, setCharApproval, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()

  return (
    <section id="characters" className="rs-chars-section">
      <SectionHead>Character Bible</SectionHead>
      <div className="rs-chars-grid">
        {characters.map(char => {
          const asset = charMedia[char.id] ?? {}
          const genInfo = canGenerateInfo(settings, 'image', settings.imageProvider, plan)
          const storeKey = `char-img:${seriesSlug}:${char.id}:0`
          return (
            <div key={char.id} className="rs-char-card">
              <ImageAsset
                asset={{ ...asset, saving: saving[storeKey] }}
                onGenerate={() => generateCharacterImage(char, char.midjourney_prompt)}
                onApprovalChange={s => setCharApproval(char.id, s)}
                disabled={!genInfo.allowed}
                disabledHint={genInfo.allowed ? null : genHint('image', settings.imageProvider, plan, genInfo.reason)}
                locked={genInfo.reason === 'plan'}
                lockedHint={genInfo.reason === 'plan' ? genHint('image', settings.imageProvider, plan, 'plan') : null}
                onUpgrade={onOpenBilling}
                plan={plan}
                cloudEnabled={cloudEnabled && asset.status === 'done'}
                onSaveToCloud={() => saveToCloud('image', char.id, storeKey, { provider: settings.imageProvider, prompt: char.midjourney_prompt, quality: settings.imageQuality, aspectRatio: settings.aspectRatio })}
                onDeleteFromCloud={() => deleteFromCloud('image', char.id)}
              />
              <div className="rs-char-name-row">
                <span className="rs-char-name">
                  <Editable value={char.name} onChange={v => onUpdateChar(char.id, 'name', v)} />
                </span>
                <span className="rs-char-role-badge" style={{ border: `1px solid ${roleColor(char.role)}`, color: roleColor(char.role) }}>{char.role}</span>
                <span className="rs-char-age">{char.age}</span>
              </div>
              <p className="rs-char-desc">
                <Editable value={char.description} onChange={v => onUpdateChar(char.id, 'description', v)} multiline />
              </p>
              <Label>Midjourney Prompt</Label>
              <pre className="rs-char-prompt-pre">
                <Editable value={char.midjourney_prompt} onChange={v => onUpdateChar(char.id, 'midjourney_prompt', v)} multiline style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }} />
              </pre>
              <div className="rs-char-copy-row">
                <CopyBtn text={char.midjourney_prompt} label="Copy MJ Prompt" />
                <CopyBtn text={char.midjourney_prompt.replace(/,\s*--ar\s*\S+/g, '').replace(/--style\s*\S+/g, '').trim()} label="Copy FLUX" />
              </div>
              <Label>ElevenLabs Voice</Label>
              <p className="rs-char-voice">
                <Editable value={char.elevenlabs_voice} onChange={v => onUpdateChar(char.id, 'elevenlabs_voice', v)} multiline style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }} />
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Dialogue line ──────────────────────────────────────────────────────────
function DialogueLine({ line, dIdx, epNum, sceneNum, characters, plan, onOpenBilling }) {
  const { settings } = useSettings()
  const { dialogue, generateDialogueVoice, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()
  const key = `ep${epNum}-s${sceneNum}-d${dIdx}`
  const asset = dialogue[key] ?? {}
  const genInfo = canGenerateInfo(settings, 'voice', settings.voiceProvider, plan)
  const storeKey = `dialogue-audio:${seriesSlug}:ep${epNum}:s${sceneNum}:d${dIdx}`

  return (
    <div className="rs-dialogue-line" style={{ borderLeft: `2px solid ${charColor(line.character, characters)}44` }}>
      <div className="rs-dialogue-char-name" style={{ color: charColor(line.character, characters) }}>
        {charName(line.character, characters)}
      </div>
      <div className="rs-dialogue-text">
        "{line.line}"
      </div>
      <div className="rs-dialogue-direction">{line.voice_direction}</div>
      <AudioAsset
        asset={{ ...asset, saving: saving[storeKey] }}
        onGenerate={() => generateDialogueVoice(epNum, sceneNum, dIdx, line.line, null)}
        disabled={!genInfo.allowed}
        label={genInfo.allowed ? 'Generate Voice' : (genInfo.reason === 'plan' ? `Upgrade to ${planLabel(minPlanFor('voice'))}` : 'Set ElevenLabs key')}
        locked={genInfo.reason === 'plan'}
        lockedHint={genInfo.reason === 'plan' ? genHint('voice', settings.voiceProvider, plan, 'plan') : null}
        onUpgrade={onOpenBilling}
        cloudEnabled={cloudEnabled && asset.status === 'done'}
        onSaveToCloud={() => saveToCloud('audio', key, storeKey, { provider: settings.voiceProvider })}
        onDeleteFromCloud={() => deleteFromCloud('audio', key)}
      />
    </div>
  )
}

// ── Scene card ─────────────────────────────────────────────────────────────
function SceneCard({ scene, epNum, charIds, characters, onUpdateKling, generationMode, plan, onOpenBilling }) {
  const { settings } = useSettings()
  const { scenes, generateSceneVideo, setSceneApproval, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()
  const key = `ep${epNum}-s${scene.scene_number}`
  const asset = scenes[key] ?? {}
  const genInfo = canGenerateInfo(settings, 'video', settings.videoProvider, plan)
  const storeKey = `scene-vid:${seriesSlug}:ep${epNum}:s${scene.scene_number}`

  return (
    <div className="rs-scene-card">
      <div className="rs-scene-slug">
        {scene.slug}
      </div>

      {/* Kling prompt */}
      <div className="rs-scene-prompt-wrap">
        <div className="rs-scene-prompt-header">
          <Label>Kling AI Prompt</Label>
          <CopyBtn text={scene.kling_prompt} label="Copy Kling Prompt" />
        </div>
        <pre className="rs-scene-prompt-pre">
          <Editable value={scene.kling_prompt} onChange={onUpdateKling} multiline style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }} />
        </pre>
      </div>

      {/* Stage direction */}
      <p className="rs-scene-direction">{scene.stage_direction}</p>

      {/* Video asset */}
      <VideoAsset
        asset={{ ...asset, saving: saving[storeKey] }}
        onGenerate={() => generateSceneVideo(epNum, scene, charIds)}
        onApprovalChange={s => setSceneApproval(key, s)}
        disabled={!genInfo.allowed || generationMode === 'batch'}
        label={genInfo.allowed ? 'Generate Video' : (genInfo.reason === 'plan' ? `Upgrade to ${planLabel(minPlanFor('video'))}` : 'Set video API key')}
        locked={genInfo.reason === 'plan'}
        lockedHint={genInfo.reason === 'plan' ? genHint('video', settings.videoProvider, plan, 'plan') : null}
        onUpgrade={onOpenBilling}
        cloudEnabled={cloudEnabled && asset.status === 'done'}
        onSaveToCloud={() => saveToCloud('video', key, storeKey, { provider: settings.videoProvider, prompt: scene.kling_prompt, quality: settings.videoQuality, aspectRatio: settings.aspectRatio })}
        onDeleteFromCloud={() => deleteFromCloud('video', key)}
      />

      {/* Dialogue */}
      <div className="rs-scene-dialogue-wrap">
        {(scene.dialogue || []).map((d, i) => (
          <DialogueLine key={i} line={d} dIdx={i} epNum={epNum} sceneNum={scene.scene_number} characters={characters} plan={plan} onOpenBilling={onOpenBilling} />
        ))}
      </div>
    </div>
  )
}

// ── Compile Episode Video control ──────────────────────────────────────────
function CompileEpisodeControl({ episode, seriesId, sceneMedia, plan, onOpenBilling }) {
  const [compileState, setCompileState] = useState('idle') // idle | compiling | done | error
  const [compiledUrl, setCompiledUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  // Gather ready scene video URLs (remoteUrl = S3/provider url, status === 'done')
  const readyClips = (episode.scenes || [])
    .map(scene => {
      const key = `ep${episode.number}-s${scene.scene_number}`
      const asset = sceneMedia[key] ?? {}
      return asset.status === 'done' ? (asset.remoteUrl || asset.serverUrl || null) : null
    })
    .filter(Boolean)

  const videoPlanAllowed = planAllows(plan, 'video')

  // Plan-locked: show upgrade CTA
  if (!videoPlanAllowed) {
    return (
      <div className="rs-compile-locked">
        <div>
          <span className="rs-compile-locked-label">
            Compile Episode Video
          </span>
          <p className="rs-compile-locked-hint">
            Stitch all scene clips into a 2–3 min reel. Requires {planLabel(minPlanFor('video'))} plan or higher.
          </p>
        </div>
        <button
          onClick={onOpenBilling}
          className="rs-compile-locked-upgrade-btn"
        >
          Upgrade to {planLabel(minPlanFor('video'))}
        </button>
      </div>
    )
  }

  async function handleCompile() {
    if (!seriesId) return
    if (readyClips.length < 2) return
    setCompileState('compiling')
    setErrorMsg(null)
    setCompiledUrl(null)
    try {
      const { jobId } = await managedApi.compileEpisode({ seriesId, episodeNumber: episode.number, clips: readyClips })
      const job = await pollJob(jobId, { intervalMs: 3000, timeoutMs: 600000 })
      if (job.status === 'done' && job.resultUrl) {
        setCompiledUrl(job.resultUrl)
        setCompileState('done')
      } else {
        throw new Error(job.errorMessage || 'Compile failed')
      }
    } catch (err) {
      let msg = err.message || 'Compile failed'
      if (err.status === 403 && err.code === 'plan_feature') msg = `Your plan does not include video. Upgrade to ${err.requiredPlan || minPlanFor('video')}.`
      else if (err.status === 402) msg = 'Insufficient credits to compile. Purchase more credits.'
      setErrorMsg(msg)
      setCompileState('error')
    }
  }

  const isDisabledNoClips = readyClips.length < 2
  const isDisabledNoSeries = !seriesId
  const isDisabled = isDisabledNoClips || isDisabledNoSeries || compileState === 'compiling'

  let hintText = null
  if (isDisabledNoSeries) hintText = 'Save the series first to enable compilation.'
  else if (isDisabledNoClips) hintText = `Generate at least 2 scene videos first (${readyClips.length} ready).`

  return (
    <div className="rs-compile-panel">
      <div className="rs-compile-panel-inner" style={{ marginBottom: compileState === 'done' || errorMsg ? '14px' : 0 }}>
        <div>
          <span className="rs-compile-label">
            Compile Episode Video
          </span>
          {hintText && (
            <p className="rs-compile-hint">{hintText}</p>
          )}
          {!hintText && compileState === 'idle' && (
            <p className="rs-compile-hint">
              {readyClips.length} scene clip{readyClips.length !== 1 ? 's' : ''} ready — stitch into a 2–3 min reel (5 credits)
            </p>
          )}
          {compileState === 'compiling' && (
            <p className="rs-compile-compiling-hint">
              Compiling… this can take a few minutes
            </p>
          )}
        </div>
        <button
          onClick={handleCompile}
          disabled={isDisabled}
          aria-label={isDisabled ? (hintText || 'Compiling…') : `Compile episode ${episode.number} video`}
          className="rs-compile-btn"
          style={{
            border: `1px solid ${isDisabled ? 'var(--border)' : 'var(--gold)'}`,
            color: isDisabled ? 'var(--muted)' : 'var(--gold)',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            opacity: isDisabled ? 0.55 : 1,
          }}
        >
          {compileState === 'compiling' ? '⏳ Compiling…' : 'Compile Episode Video (2–3 min)'}
        </button>
      </div>

      {/* Error state */}
      {compileState === 'error' && errorMsg && (
        <div className="rs-compile-error">
          {errorMsg}{' '}
          <button onClick={() => { setCompileState('idle'); setErrorMsg(null) }} className="rs-compile-retry-btn">Retry</button>
        </div>
      )}

      {/* Done — compiled video player + download */}
      {compileState === 'done' && compiledUrl && (
        <div className="rs-compile-done">
          <video
            src={compiledUrl}
            controls
            playsInline
            aria-label={`Compiled episode ${episode.number} video`}
            className="rs-compile-video"
          />
          <div className="rs-compile-done-actions">
            <a
              href={compiledUrl}
              download={`episode-${episode.number}-compiled.mp4`}
              aria-label={`Download compiled episode ${episode.number} video`}
              className="rs-compile-download-link"
            >
              Download MP4
            </a>
            <button
              onClick={() => { setCompileState('idle'); setCompiledUrl(null) }}
              className="rs-compile-recompile-btn"
            >
              Re-compile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Episode section ────────────────────────────────────────────────────────
function EpisodeSection({ episode, characters, onUpdate, generationMode, seriesRef, plan, onOpenBilling, seriesId, sceneMedia }) {
  const [showSocial, setShowSocial] = useState(false)

  return (
    <section id={`episode-${episode.number}`} className="rs-episode-section">
      <div className="rs-episode-header">
        <div className="rs-episode-number">
          {String(episode.number).padStart(2, '0')}
        </div>
        <div className="rs-episode-title">
          <Editable value={episode.title} onChange={v => onUpdate('title', v)} />
        </div>
        <div className="rs-episode-tags">
          {[episode.duration, episode.mood, ...(episode.locations || [])].filter(Boolean).map((t, i) => (
            <span key={i} className="rs-episode-tag">{t}</span>
          ))}
        </div>
      </div>

      {/* Social hook */}
      <div className="rs-social-hook">
        <div className="rs-social-hook-content">
          <Label style={{ color: '#804040' }}>Social Hook</Label>
          <p className="rs-social-hook-text">
            <Editable value={episode.social_hook} onChange={v => onUpdate('social_hook', v)} multiline />
          </p>
        </div>
        <div className="rs-social-hook-actions">
          <CopyBtn text={episode.social_hook} label="Copy" />
          <button onClick={() => setShowSocial(true)} className="rs-social-cards-btn">
            📱 Social Cards
          </button>
        </div>
      </div>

      {/* Scenes */}
      {(episode.scenes || []).map(scene => (
        <SceneCard
          key={scene.scene_number}
          scene={scene}
          epNum={episode.number}
          charIds={episode.characters_in_episode || []}
          characters={characters}
          onUpdateKling={v => onUpdate(`scenes.${scene.scene_number - 1}.kling_prompt`, v)}
          generationMode={generationMode}
          plan={plan}
          onOpenBilling={onOpenBilling}
        />
      ))}

      {/* Compile Episode Video */}
      <CompileEpisodeControl
        episode={episode}
        seriesId={seriesId}
        sceneMedia={sceneMedia}
        plan={plan}
        onOpenBilling={onOpenBilling}
      />

      {/* CTA */}
      <div className="rs-cta-block">
        <div>
          <Label style={{ color: '#804040' }}>Call to Action</Label>
          <p className="rs-cta-text"><Editable value={episode.cta} onChange={v => onUpdate('cta', v)} /></p>
        </div>
        <CopyBtn text={episode.cta} label="Copy" />
      </div>

      {/* Hashtags */}
      <div className="rs-hashtags">
        {(episode.hashtags || []).map((tag, i) => (
          <span key={i} className="rs-hashtag">{tag.startsWith('#') ? tag : `#${tag}`}</span>
        ))}
        <CopyBtn text={(episode.hashtags || []).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')} label="Copy All" />
      </div>

      {showSocial && <SocialCardModal episode={episode} series={seriesRef} onClose={() => setShowSocial(false)} />}
    </section>
  )
}

// ── Production Guide ───────────────────────────────────────────────────────
function ProductionGuide({ guide }) {
  if (!guide) return null
  const cards = [
    guide.visual_style      && { title: 'Visual Style',    content: guide.visual_style },
    guide.music_direction   && { title: 'Music Direction', content: guide.music_direction },
    guide.posting_schedule  && { title: 'Posting Schedule', content: guide.posting_schedule },
    guide.recommended_tools?.length && { title: 'Tools',   list: guide.recommended_tools },
    guide.engagement_tips?.length   && { title: 'Engagement Tips', list: guide.engagement_tips },
  ].filter(Boolean)

  return (
    <section id="production-guide" className="rs-prod-section">
      <SectionHead>Production Guide</SectionHead>
      <div className="rs-prod-grid">
        {cards.map((card, i) => (
          <div key={i} className="rs-prod-card">
            <div className="rs-prod-card-title">{card.title}</div>
            {card.content && <p className="rs-prod-card-content">{card.content}</p>}
            {card.list && <ul className="rs-prod-card-list">{card.list.map((item, j) => (
              <li key={j} className="rs-prod-card-list-item">
                <span className="rs-prod-card-list-arrow">→</span>{item}
              </li>
            ))}</ul>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────
function SectionHead({ children }) {
  return (
    <div className="rs-section-head">
      {children}
    </div>
  )
}
function Label({ children, style }) {
  return <div className="rs-label" style={style}>{children}</div>
}

// ── Batch cost modal ───────────────────────────────────────────────────────
function BatchCostModal({ series, settings, onConfirm, onCancel }) {
  const est = estimateBatchCost(series, settings)
  const panelRef = useRef(null)
  useDivModalA11y(onCancel, panelRef)
  return (
    <div role="presentation" className="ds-modal-overlay">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-cost-modal-title"
        className="rs-batch-modal-card"
      >
        <div id="batch-cost-modal-title" className="rs-batch-modal-title">Estimated Cost</div>
        {[['Images', `${est.counts.chars} characters`, `$${est.images.toFixed(3)}`], ['Videos', `${est.counts.scenes} scenes`, `$${est.videos.toFixed(3)}`], ['Voice', `${est.counts.dialogueChars} chars`, `$${est.voice.toFixed(4)}`]].map(([type, detail, cost]) => (
          <div key={type} className="rs-batch-cost-row">
            <span>{type} <span className="rs-batch-cost-detail">({detail})</span></span>
            <span>{cost}</span>
          </div>
        ))}
        <div className="rs-batch-total-row">
          <span>Total estimate</span><span>${est.total.toFixed(3)}</span>
        </div>
        <div className="rs-batch-modal-actions">
          <button onClick={onConfirm} className="rs-batch-confirm-btn">
            CONFIRM &amp; GENERATE
          </button>
          <button onClick={onCancel} className="rs-batch-cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Share dropdown for the toolbar ────────────────────────────────────────
function ShareDropdown({ seriesId, onClose }) {
  const [shareToken, setShareToken] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = shareToken ? `${window.location.origin}/?share=${shareToken}` : null

  async function handleShare() {
    if (!seriesId) return
    setBusy(true)
    try {
      const res = await seriesApi.share(seriesId)
      setShareToken(res.shareToken)
    } catch (err) { console.warn('Share failed', err) }
    finally { setBusy(false) }
  }

  async function handleRevoke() {
    if (!seriesId) return
    setBusy(true)
    try {
      await seriesApi.unshare(seriesId)
      setShareToken(null)
    } catch (err) { console.warn('Revoke failed', err) }
    finally { setBusy(false) }
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div role="dialog" aria-label="Share series" className="rs-share-dropdown">
      <div className="rs-share-header">
        <span className="rs-share-title">Share Series</span>
        <button onClick={onClose} aria-label="Close share panel" className="rs-share-close-btn">×</button>
      </div>

      {!seriesId && (
        <p className="rs-share-hint">
          Save to your library first to get a shareable link.
        </p>
      )}

      {seriesId && !shareToken && (
        <>
          <p className="rs-share-hint rs-share-hint--mb">
            Create a public read-only link anyone can view.
          </p>
          <button onClick={handleShare} disabled={busy} aria-label="Create public share link"
            className="rs-toolbar-btn"
            style={{ border: `1px solid var(--gold)`, color: 'var(--gold)', width: '100%', textAlign: 'center' }}>
            {busy ? '…' : '+ Create Share Link'}
          </button>
        </>
      )}

      {seriesId && shareToken && (
        <>
          <div className="rs-share-link-label">Link active</div>
          <div className="rs-share-url-row">
            <input
              readOnly
              value={shareUrl}
              aria-label="Public share URL"
              className="rs-share-url-input"
              onFocus={e => e.target.select()}
            />
            <button onClick={handleCopy} aria-label="Copy share URL"
              className="rs-toolbar-btn"
              style={{ border: `1px solid ${copied ? '#3a7a4a' : 'var(--border)'}`, color: copied ? '#6dc87a' : 'var(--muted)', padding: '6px 10px' }}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={busy} aria-label="Revoke public link"
            className="rs-toolbar-btn"
            style={{ border: '1px solid #3a1818', color: '#804040', width: '100%', textAlign: 'center' }}>
            {busy ? '…' : 'Revoke Link'}
          </button>
        </>
      )}
    </div>
  )
}

// ── ResultsScreen root ─────────────────────────────────────────────────────
export default function ResultsScreen({ series: initialSeries, seriesId, onNewBook, onOpenBilling }) {
  const { settings } = useSettings()
  const { activeWorkspacePlan } = useAuth()
  const { sessionCost, generateBatch, characters: charMedia, scenes: sceneMedia, dialogue: dialogueMedia, generateSceneVideo, cloudEnabled, saveToCloud, seriesSlug } = useMedia()
  const [series, setSeries] = useState(initialSeries)
  const [showSettings, setShowSettings] = useState(false)
  const [showStoryboard, setShowStoryboard] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [savingAll, setSavingAll] = useState(false)

  const { title, author, logline, series_hook, characters = [], episodes = [], production_guide } = series

  // Inline edit helpers
  const updateChar = useCallback((charId, field, val) => {
    setSeries(prev => ({ ...prev, characters: prev.characters.map(c => c.id === charId ? { ...c, [field]: val } : c) }))
  }, [])

  const updateEpisode = useCallback((epNum, field, val) => {
    setSeries(prev => {
      const episodes = prev.episodes.map(ep => {
        if (ep.number !== epNum) return ep
        // Support dot-path like "scenes.0.kling_prompt"
        const parts = field.split('.')
        if (parts.length === 1) return { ...ep, [field]: val }
        if (parts[0] === 'scenes') {
          const idx = parseInt(parts[1], 10)
          const subField = parts[2]
          return { ...ep, scenes: ep.scenes.map((s, i) => i === idx ? { ...s, [subField]: val } : s) }
        }
        return ep
      })
      return { ...prev, episodes }
    })
  }, [])

  const mediaState = { characters: charMedia, scenes: sceneMedia, dialogue: dialogueMedia }

  const sidebarLinks = [
    { id: 'characters', label: 'Characters' },
    ...episodes.map(ep => ({ id: `episode-${ep.number}`, label: `Ep ${ep.number} — ${ep.title}` })),
    { id: 'production-guide', label: 'Production Guide' },
  ]

  async function handleZipExport() {
    setZipping(true)
    try { await exportZip(series, mediaState, undefined, activeWorkspacePlan) } finally { setZipping(false) }
  }

  function handleBibleExport() {
    const html = generateSeriesBibleHtml(series, mediaState)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    saveAs(blob, `${title.replace(/\s+/g, '-').toLowerCase()}-series-bible.html`)
  }

  // ── Save all done + unsaved assets to cloud ──────────────────────────────
  async function handleSaveAllToCloud() {
    if (!cloudEnabled || savingAll) return
    setSavingAll(true)
    try {
      const tasks = []
      // Character images
      for (const char of series.characters ?? []) {
        const asset = charMedia[char.id]
        if (asset?.status === 'done' && !asset.savedToCloud) {
          const storeKey = `char-img:${seriesSlug}:${char.id}:0`
          tasks.push(saveToCloud('image', char.id, storeKey, { provider: settings.imageProvider, prompt: char.midjourney_prompt, quality: settings.imageQuality, aspectRatio: settings.aspectRatio }))
        }
      }
      // Scene videos
      for (const ep of series.episodes ?? []) {
        for (const scene of ep.scenes ?? []) {
          const key = `ep${ep.number}-s${scene.scene_number}`
          const asset = sceneMedia[key]
          if (asset?.status === 'done' && !asset.savedToCloud) {
            const storeKey = `scene-vid:${seriesSlug}:ep${ep.number}:s${scene.scene_number}`
            tasks.push(saveToCloud('video', key, storeKey, { provider: settings.videoProvider, prompt: scene.kling_prompt, quality: settings.videoQuality, aspectRatio: settings.aspectRatio }))
          }
        }
        // Dialogue audio
        for (const scene of ep.scenes ?? []) {
          for (let dIdx = 0; dIdx < (scene.dialogue?.length ?? 0); dIdx++) {
            const key = `ep${ep.number}-s${scene.scene_number}-d${dIdx}`
            const asset = dialogueMedia[key]
            if (asset?.status === 'done' && !asset.savedToCloud) {
              const storeKey = `dialogue-audio:${seriesSlug}:ep${ep.number}:s${scene.scene_number}:d${dIdx}`
              tasks.push(saveToCloud('audio', key, storeKey, { provider: settings.voiceProvider }))
            }
          }
        }
      }
      await Promise.allSettled(tasks)
    } finally {
      setSavingAll(false)
    }
  }

  // Count how many done assets haven't been saved yet (for the toolbar hint)
  const unsavedCount = (() => {
    if (!cloudEnabled) return 0
    let n = 0
    for (const a of Object.values(charMedia))   if (a.status === 'done' && !a.savedToCloud) n++
    for (const a of Object.values(sceneMedia))  if (a.status === 'done' && !a.savedToCloud) n++
    for (const a of Object.values(dialogueMedia)) if (a.status === 'done' && !a.savedToCloud) n++
    return n
  })()

  return (
    <div className="rs-root">

      {/* Sticky top bar */}
      <div className="rs-toolbar">
        {/* Title */}
        <div className="rs-toolbar-title-wrap">
          <div className="rs-toolbar-title">{title}</div>
          <div className="rs-toolbar-author">{author}</div>
        </div>

        {/* Cost tracker */}
        <div className="rs-cost-tracker">
          <span title="Images">🖼 ${sessionCost.images?.toFixed(3) ?? '0.000'}</span>
          <span title="Videos">🎬 ${sessionCost.videos?.toFixed(3) ?? '0.000'}</span>
          <span title="Voice">🎙 ${sessionCost.voice?.toFixed(4) ?? '0.0000'}</span>
          <span className="rs-cost-total">=  {totalCost(sessionCost)}</span>
        </div>

        {/* Batch button (batch or hybrid mode) */}
        {settings.generationMode !== 'on-demand' && (
          <button onClick={() => setShowBatchModal(true)} className="rs-batch-btn">
            ⚡ {settings.generationMode === 'hybrid' ? 'Generate Images + Voice' : 'Generate All Media'}
          </button>
        )}

        {/* Actions */}
        <button onClick={() => setShowStoryboard(true)} className="rs-toolbar-btn rs-toolbar-btn--default">🎞 Storyboard</button>
        <button onClick={() => exportHtml(series)} aria-label="Export as HTML" className="rs-toolbar-btn rs-toolbar-btn--default">HTML</button>
        <button onClick={handleBibleExport} aria-label="Export series bible" className="rs-toolbar-btn rs-toolbar-btn--default">Bible</button>
        <button onClick={handleZipExport} disabled={zipping} aria-label={zipping ? 'Exporting ZIP…' : 'Download ZIP export'} className="rs-toolbar-btn rs-toolbar-btn--default">{zipping ? 'Zipping…' : '⬇ ZIP'}</button>
        <div className="rs-share-wrap">
          <button
            onClick={() => setShowShare(v => !v)}
            aria-label="Share series"
            aria-expanded={showShare}
            aria-haspopup="dialog"
            className="rs-toolbar-btn rs-toolbar-btn--default"
          >
            ⬡ Share
          </button>
          {showShare && <ShareDropdown seriesId={seriesId} onClose={() => setShowShare(false)} />}
        </div>
        {/* Cloud save-all (only when authed + seriesId) */}
        {cloudEnabled && (
          <button
            onClick={handleSaveAllToCloud}
            disabled={savingAll || unsavedCount === 0}
            aria-label={savingAll ? 'Saving all assets to library…' : `Save all to library${unsavedCount > 0 ? ` (${unsavedCount} unsaved)` : ''}`}
            title={unsavedCount === 0 ? 'All generated assets are saved' : `Save ${unsavedCount} unsaved asset${unsavedCount !== 1 ? 's' : ''} to cloud library`}
            className="rs-toolbar-btn"
            style={{ border: `1px solid ${unsavedCount > 0 ? '#1e4a2a' : 'var(--border)'}`, color: unsavedCount > 0 ? '#6dc87a' : 'var(--muted)' }}
          >
            {savingAll ? '☁ Saving…' : unsavedCount > 0 ? `☁ Save All (${unsavedCount})` : '☁ All Saved'}
          </button>
        )}
        <button onClick={() => setShowSettings(true)} aria-label="Open settings" className="rs-toolbar-btn rs-toolbar-btn--default">⚙</button>
        <button onClick={onNewBook} className="rs-toolbar-btn rs-toolbar-btn--default">+ New</button>
      </div>

      <div className="rs-body">
        {/* Sidebar */}
        <nav className="rs-sidebar">
          {sidebarLinks.map(link => (
            <a key={link.id} href={`#${link.id}`} className="rs-sidebar-link">{link.label}</a>
          ))}
        </nav>

        {/* Main content */}
        <main className="rs-main">
          <div className="rs-intro">
            <p className="rs-logline">{logline}</p>
            <p className="rs-series-hook">{series_hook}</p>
          </div>

          <CharacterBible characters={characters} seriesTitle={title} onUpdateChar={updateChar} plan={activeWorkspacePlan} onOpenBilling={onOpenBilling} />

          {episodes.map(ep => (
            <EpisodeSection
              key={ep.number}
              episode={ep}
              characters={characters}
              onUpdate={(field, val) => updateEpisode(ep.number, field, val)}
              generationMode={settings.generationMode}
              seriesRef={series}
              plan={activeWorkspacePlan}
              onOpenBilling={onOpenBilling}
              seriesId={seriesId}
              sceneMedia={sceneMedia}
            />
          ))}

          <ProductionGuide guide={production_guide} />

          {/* AI-generated content disclosure */}
          <div className="rs-disclosure">
            <p className="rs-disclosure-text">
              Images, video, and voice on this page are AI-generated. Review before publishing and disclose AI origin per platform rules.
            </p>
          </div>
        </main>
      </div>

      {/* Overlays */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showStoryboard && (
        <StoryboardView
          series={series}
          onClose={() => setShowStoryboard(false)}
          onGenerateScene={(epNum, scene, charIds) => generateSceneVideo(epNum, scene, charIds)}
        />
      )}
      {showBatchModal && (
        <BatchCostModal
          series={series}
          settings={settings}
          onConfirm={() => { setShowBatchModal(false); generateBatch(series, settings.generationMode) }}
          onCancel={() => setShowBatchModal(false)}
        />
      )}
    </div>
  )
}
