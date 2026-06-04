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
import ApprovalBadge from './ApprovalBadge'
import SettingsPanel from './SettingsPanel'
import StoryboardView from './StoryboardView'
import SocialCardModal from './SocialCardModal'
import { useDivModalA11y } from '../hooks/useModalA11y'
import { series as seriesApi } from '../lib/api'

// Whether generation is possible for a media kind given current settings.
// Managed mode covers image + voice server-side (no client key needed); video has no
// managed path so it always needs a BYO key. Keyless local providers never need a key.
const KEYLESS_PROVIDERS = { image: ['comfyui', 'a1111'], voice: ['kokoro', 'xtts'], video: ['localvideo'] }
const PROVIDER_KEY_REMAP = { 'fal.ai': 'falai', openaitts: 'openai' }
function canGenerate(settings, kind, provider) {
  if (settings.mode === 'managed' && (kind === 'image' || kind === 'voice')) return true
  if ((KEYLESS_PROVIDERS[kind] || []).includes(provider)) return true
  const keyName = PROVIDER_KEY_REMAP[provider] || provider
  return !!settings.apiKeys?.[keyName]
}
// Short hint shown when a generate button is disabled, so it explains itself.
function genHint(kind, provider) {
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
      style: {
        background: '#0a0806',
        border: '1px solid var(--gold)',
        color: 'var(--cream)',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        fontStyle: 'inherit',
        width: '100%',
        padding: '4px 8px',
        outline: 'none',
        resize: multiline ? 'vertical' : 'none',
        ...style,
      },
    }
    return multiline ? <textarea rows={4} {...props} /> : <input {...props} />
  }

  return (
    <span onClick={() => setEditing(true)} title="Click to edit" style={{ cursor: 'text', borderBottom: '1px dashed #2a3a4a', ...displayStyle }}>
      {value || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Click to edit…</span>}
    </span>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '5px 12px', border: `1px solid ${copied ? '#3a7a4a' : 'var(--border)'}`, background: 'transparent', color: copied ? '#6dc87a' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
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
function CharacterBible({ characters, seriesTitle, onUpdateChar, plan = 'free' }) {
  const { settings } = useSettings()
  const { characters: charMedia, generateCharacterImage, setCharApproval, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()

  return (
    <section id="characters" style={{ marginBottom: '64px' }}>
      <SectionHead>Character Bible</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {characters.map(char => {
          const asset = charMedia[char.id] ?? {}
          const canGen = canGenerate(settings, 'image', settings.imageProvider)
          const storeKey = `char-img:${seriesSlug}:${char.id}:0`
          return (
            <div key={char.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
              <ImageAsset
                asset={{ ...asset, saving: saving[storeKey] }}
                onGenerate={() => generateCharacterImage(char, char.midjourney_prompt)}
                onApprovalChange={s => setCharApproval(char.id, s)}
                disabled={!canGen}
                disabledHint={canGen ? null : genHint('image', settings.imageProvider)}
                plan={plan}
                cloudEnabled={cloudEnabled && asset.status === 'done'}
                onSaveToCloud={() => saveToCloud('image', char.id, storeKey, { provider: settings.imageProvider, prompt: char.midjourney_prompt, quality: settings.imageQuality, aspectRatio: settings.aspectRatio })}
                onDeleteFromCloud={() => deleteFromCloud('image', char.id)}
              />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: 'var(--cream)' }}>
                  <Editable value={char.name} onChange={v => onUpdateChar(char.id, 'name', v)} />
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '2px 8px', border: `1px solid ${roleColor(char.role)}`, color: roleColor(char.role), letterSpacing: '1.5px', textTransform: 'uppercase' }}>{char.role}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>{char.age}</span>
              </div>
              <p style={{ fontStyle: 'italic', color: '#c0b090', marginBottom: '14px', fontSize: '15px' }}>
                <Editable value={char.description} onChange={v => onUpdateChar(char.id, 'description', v)} multiline />
              </p>
              <Label>Midjourney Prompt</Label>
              <pre style={{ background: '#0a0806', borderLeft: '3px solid var(--gold)', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#c8b090', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '8px' }}>
                <Editable value={char.midjourney_prompt} onChange={v => onUpdateChar(char.id, 'midjourney_prompt', v)} multiline style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }} />
              </pre>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <CopyBtn text={char.midjourney_prompt} label="Copy MJ Prompt" />
                <CopyBtn text={char.midjourney_prompt.replace(/,\s*--ar\s*\S+/g, '').replace(/--style\s*\S+/g, '').trim()} label="Copy FLUX" />
              </div>
              <Label>ElevenLabs Voice</Label>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6a8090', lineHeight: '1.7' }}>
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
function DialogueLine({ line, dIdx, epNum, sceneNum, characters }) {
  const { settings } = useSettings()
  const { dialogue, generateDialogueVoice, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()
  const key = `ep${epNum}-s${sceneNum}-d${dIdx}`
  const asset = dialogue[key] ?? {}
  const canGen = canGenerate(settings, 'voice', settings.voiceProvider)
  const storeKey = `dialogue-audio:${seriesSlug}:ep${epNum}:s${sceneNum}:d${dIdx}`

  return (
    <div style={{ marginBottom: '18px', paddingLeft: '16px', borderLeft: `2px solid ${charColor(line.character, characters)}44` }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontVariant: 'small-caps', letterSpacing: '2px', color: charColor(line.character, characters), marginBottom: '4px' }}>
        {charName(line.character, characters)}
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '19px', color: 'var(--cream)', lineHeight: '1.6', marginBottom: '4px' }}>
        "{line.line}"
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#4a5a6a', marginBottom: '6px' }}>{line.voice_direction}</div>
      <AudioAsset
        asset={{ ...asset, saving: saving[storeKey] }}
        onGenerate={() => generateDialogueVoice(epNum, sceneNum, dIdx, line.line, null)}
        disabled={!canGen}
        label={canGen ? 'Generate Voice' : 'Set ElevenLabs key'}
        cloudEnabled={cloudEnabled && asset.status === 'done'}
        onSaveToCloud={() => saveToCloud('audio', key, storeKey, { provider: settings.voiceProvider })}
        onDeleteFromCloud={() => deleteFromCloud('audio', key)}
      />
    </div>
  )
}

// ── Scene card ─────────────────────────────────────────────────────────────
function SceneCard({ scene, epNum, charIds, characters, onUpdateKling, generationMode }) {
  const { settings } = useSettings()
  const { scenes, generateSceneVideo, setSceneApproval, cloudEnabled, saveToCloud, deleteFromCloud, saving, seriesSlug } = useMedia()
  const key = `ep${epNum}-s${scene.scene_number}`
  const asset = scenes[key] ?? {}
  const canGen = canGenerate(settings, 'video', settings.videoProvider)
  const storeKey = `scene-vid:${seriesSlug}:ep${epNum}:s${scene.scene_number}`

  return (
    <div style={{ marginBottom: '36px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '14px', paddingTop: '18px', borderTop: '1px dashed var(--border)' }}>
        {scene.slug}
      </div>

      {/* Kling prompt */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
          <Label>Kling AI Prompt</Label>
          <CopyBtn text={scene.kling_prompt} label="Copy Kling Prompt" />
        </div>
        <pre style={{ background: '#0a0806', borderLeft: '3px solid var(--gold)', padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', lineHeight: '1.8', color: '#c8b090', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          <Editable value={scene.kling_prompt} onChange={onUpdateKling} multiline style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }} />
        </pre>
      </div>

      {/* Stage direction */}
      <p style={{ fontStyle: 'italic', color: 'var(--muted)', marginBottom: '18px', fontSize: '16px' }}>{scene.stage_direction}</p>

      {/* Video asset */}
      <VideoAsset
        asset={{ ...asset, saving: saving[storeKey] }}
        onGenerate={() => generateSceneVideo(epNum, scene, charIds)}
        onApprovalChange={s => setSceneApproval(key, s)}
        disabled={!canGen || generationMode === 'batch'}
        label={canGen ? 'Generate Video' : 'Set video API key'}
        cloudEnabled={cloudEnabled && asset.status === 'done'}
        onSaveToCloud={() => saveToCloud('video', key, storeKey, { provider: settings.videoProvider, prompt: scene.kling_prompt, quality: settings.videoQuality, aspectRatio: settings.aspectRatio })}
        onDeleteFromCloud={() => deleteFromCloud('video', key)}
      />

      {/* Dialogue */}
      <div style={{ paddingLeft: '8px' }}>
        {(scene.dialogue || []).map((d, i) => (
          <DialogueLine key={i} line={d} dIdx={i} epNum={epNum} sceneNum={scene.scene_number} characters={characters} />
        ))}
      </div>
    </div>
  )
}

// ── Episode section ────────────────────────────────────────────────────────
function EpisodeSection({ episode, characters, onUpdate, generationMode, seriesRef }) {
  const [showSocial, setShowSocial] = useState(false)

  return (
    <section id={`episode-${episode.number}`} style={{ marginBottom: '72px' }}>
      <div style={{ marginBottom: '24px', borderTop: '1px solid var(--border)', paddingTop: '36px' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 'clamp(56px,8vw,80px)', color: 'var(--gold)', opacity: 0.22, lineHeight: 1, marginBottom: '-8px', userSelect: 'none' }}>
          {String(episode.number).padStart(2, '0')}
        </div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 'clamp(22px,3vw,32px)', color: 'var(--cream)', marginBottom: '10px' }}>
          <Editable value={episode.title} onChange={v => onUpdate('title', v)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[episode.duration, episode.mood, ...(episode.locations || [])].filter(Boolean).map((t, i) => (
            <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '3px 10px', border: '1px solid var(--border)', color: 'var(--muted)' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Social hook */}
      <div style={{ background: '#2a0808', borderLeft: '3px solid var(--red)', padding: '14px 18px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <Label style={{ color: '#804040' }}>Social Hook</Label>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '18px', color: '#f0c8b8' }}>
            <Editable value={episode.social_hook} onChange={v => onUpdate('social_hook', v)} multiline />
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <CopyBtn text={episode.social_hook} label="Copy" />
          <button onClick={() => setShowSocial(true)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '5px 10px', border: '1px solid #804040', background: 'transparent', color: '#a06060', cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase' }}>
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
        />
      ))}

      {/* CTA */}
      <div style={{ background: '#3a0808', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div>
          <Label style={{ color: '#804040' }}>Call to Action</Label>
          <p style={{ color: '#f0c8b8' }}><Editable value={episode.cta} onChange={v => onUpdate('cta', v)} /></p>
        </div>
        <CopyBtn text={episode.cta} label="Copy" />
      </div>

      {/* Hashtags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {(episode.hashtags || []).map((tag, i) => (
          <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)' }}>{tag.startsWith('#') ? tag : `#${tag}`}</span>
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
    <section id="production-guide" style={{ marginBottom: '64px' }}>
      <SectionHead>Production Guide</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
        {cards.map((card, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '18px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>{card.title}</div>
            {card.content && <p style={{ fontStyle: 'italic', color: '#c0b090', fontSize: '15px' }}>{card.content}</p>}
            {card.list && <ul style={{ listStyle: 'none', color: '#c0b090', fontSize: '14px' }}>{card.list.map((item, j) => (
              <li key={j} style={{ marginBottom: '5px', paddingLeft: '12px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--gold)' }}>→</span>{item}
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
    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '4px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}
function Label({ children, style }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '5px', ...style }}>{children}</div>
}

// ── Batch cost modal ───────────────────────────────────────────────────────
function BatchCostModal({ series, settings, onConfirm, onCancel }) {
  const est = estimateBatchCost(series, settings)
  const panelRef = useRef(null)
  useDivModalA11y(onCancel, panelRef)
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-cost-modal-title"
        style={{ background: 'var(--surface)', border: '1px solid var(--gold)', padding: '28px', maxWidth: '440px', width: '100%' }}
      >
        <div id="batch-cost-modal-title" style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: 'var(--gold)', marginBottom: '20px', letterSpacing: '2px' }}>Estimated Cost</div>
        {[['Images', `${est.counts.chars} characters`, `$${est.images.toFixed(3)}`], ['Videos', `${est.counts.scenes} scenes`, `$${est.videos.toFixed(3)}`], ['Voice', `${est.counts.dialogueChars} chars`, `$${est.voice.toFixed(4)}`]].map(([type, detail, cost]) => (
          <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', marginBottom: '8px', color: 'var(--cream)' }}>
            <span>{type} <span style={{ color: 'var(--muted)' }}>({detail})</span></span>
            <span>{cost}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontFamily: "'Cinzel', serif", fontSize: '16px', color: 'var(--gold)' }}>
          <span>Total estimate</span><span>${est.total.toFixed(3)}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onConfirm} style={{ flex: 1, background: 'var(--gold)', color: '#080b10', border: 'none', padding: '12px', fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '2px', cursor: 'pointer', fontWeight: '600' }}>
            CONFIRM &amp; GENERATE
          </button>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', cursor: 'pointer' }}>
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
    <div role="dialog" aria-label="Share series" style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)',
      padding: '16px', width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>Share Series</span>
        <button onClick={onClose} aria-label="Close share panel" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {!seriesId && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' }}>
          Save to your library first to get a shareable link.
        </p>
      )}

      {seriesId && !shareToken && (
        <>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '12px' }}>
            Create a public read-only link anyone can view.
          </p>
          <button onClick={handleShare} disabled={busy} aria-label="Create public share link" style={{ ...topBtn('var(--gold)', 'var(--gold)'), width: '100%', textAlign: 'center' }}>
            {busy ? '…' : '+ Create Share Link'}
          </button>
        </>
      )}

      {seriesId && shareToken && (
        <>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--gold)', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>Link active</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              readOnly
              value={shareUrl}
              aria-label="Public share URL"
              style={{ flex: 1, background: '#060810', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '6px 8px', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onFocus={e => e.target.select()}
            />
            <button onClick={handleCopy} aria-label="Copy share URL" style={{ ...topBtn(copied ? '#3a7a4a' : 'var(--border)', copied ? '#6dc87a' : 'var(--muted)'), padding: '6px 10px' }}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={busy} aria-label="Revoke public link" style={{ ...topBtn('#3a1818', '#804040'), width: '100%', textAlign: 'center' }}>
            {busy ? '…' : 'Revoke Link'}
          </button>
        </>
      )}
    </div>
  )
}

// ── ResultsScreen root ─────────────────────────────────────────────────────
export default function ResultsScreen({ series: initialSeries, seriesId, onNewBook }) {
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Sticky top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '15px', color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', letterSpacing: '1px' }}>{author}</div>
        </div>

        {/* Cost tracker */}
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <span title="Images">🖼 ${sessionCost.images?.toFixed(3) ?? '0.000'}</span>
          <span title="Videos">🎬 ${sessionCost.videos?.toFixed(3) ?? '0.000'}</span>
          <span title="Voice">🎙 ${sessionCost.voice?.toFixed(4) ?? '0.0000'}</span>
          <span style={{ color: 'var(--gold)', fontWeight: '700' }}>=${totalCost(sessionCost)}</span>
        </div>

        {/* Batch button (batch or hybrid mode) */}
        {settings.generationMode !== 'on-demand' && (
          <button onClick={() => setShowBatchModal(true)} style={{ background: '#3a0808', border: '1px solid var(--red)', color: '#f0c8b8', padding: '7px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer' }}>
            ⚡ {settings.generationMode === 'hybrid' ? 'Generate Images + Voice' : 'Generate All Media'}
          </button>
        )}

        {/* Actions */}
        <button onClick={() => setShowStoryboard(true)} style={topBtn('var(--border)', 'var(--muted)')}>🎞 Storyboard</button>
        <button onClick={() => exportHtml(series)} aria-label="Export as HTML" style={topBtn('var(--border)', 'var(--muted)')}>HTML</button>
        <button onClick={handleBibleExport} aria-label="Export series bible" style={topBtn('var(--border)', 'var(--muted)')}>Bible</button>
        <button onClick={handleZipExport} disabled={zipping} aria-label={zipping ? 'Exporting ZIP…' : 'Download ZIP export'} style={topBtn('var(--border)', 'var(--muted)')}>{zipping ? 'Zipping…' : '⬇ ZIP'}</button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowShare(v => !v)}
            aria-label="Share series"
            aria-expanded={showShare}
            aria-haspopup="dialog"
            style={topBtn('var(--border)', 'var(--muted)')}
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
            style={topBtn(unsavedCount > 0 ? '#1e4a2a' : 'var(--border)', unsavedCount > 0 ? '#6dc87a' : 'var(--muted)')}
          >
            {savingAll ? '☁ Saving…' : unsavedCount > 0 ? `☁ Save All (${unsavedCount})` : '☁ All Saved'}
          </button>
        )}
        <button onClick={() => setShowSettings(true)} aria-label="Open settings" style={topBtn('var(--border)', 'var(--muted)')}>⚙</button>
        <button onClick={onNewBook} style={topBtn('var(--border)', 'var(--muted)')}>+ New</button>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <nav className="sidebar-nav" style={{ width: '200px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 0', position: 'sticky', top: '57px', height: 'calc(100vh - 57px)', overflowY: 'auto', display: 'none' }}>
          <style>{`@media(min-width:768px){.sidebar-nav{display:block!important}.results-main{padding-left:32px!important}}`}</style>
          {sidebarLinks.map(link => (
            <a key={link.id} href={`#${link.id}`} style={{ display: 'block', padding: '7px 18px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1px', color: 'var(--muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = 'var(--gold)'}
              onMouseLeave={e => e.target.style.color = 'var(--muted)'}
            >{link.label}</a>
          ))}
        </nav>

        {/* Main content */}
        <main className="results-main" style={{ flex: 1, padding: '44px 24px', maxWidth: '900px' }}>
          <div style={{ marginBottom: '48px', paddingBottom: '36px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontStyle: 'italic', color: 'var(--muted)', marginBottom: '8px', fontSize: '15px' }}>{logline}</p>
            <p style={{ color: '#c8b890', fontSize: '17px' }}>{series_hook}</p>
          </div>

          <CharacterBible characters={characters} seriesTitle={title} onUpdateChar={updateChar} plan={activeWorkspacePlan} />

          {episodes.map(ep => (
            <EpisodeSection
              key={ep.number}
              episode={ep}
              characters={characters}
              onUpdate={(field, val) => updateEpisode(ep.number, field, val)}
              generationMode={settings.generationMode}
              seriesRef={series}
            />
          ))}

          <ProductionGuide guide={production_guide} />

          {/* AI-generated content disclosure */}
          <div style={{ marginTop: '48px', paddingTop: '20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#3a4a5a', letterSpacing: '1.5px', lineHeight: '1.7' }}>
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

function topBtn(border, color) {
  return {
    background: 'transparent', border: `1px solid ${border}`, color,
    padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase',
    cursor: 'pointer', flexShrink: 0,
  }
}
