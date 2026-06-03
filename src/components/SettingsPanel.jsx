import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../contexts/SettingsContext'
import { useAuth } from '../contexts/AuthContext'
import { IMAGE_PROVIDERS, VIDEO_PROVIDERS, VOICE_PROVIDERS } from '../utils/mediaProviders/index'
import { TEXT_PROVIDERS } from '../utils/textProviders/index'
import { PROVIDER_COSTS, isFree } from '../utils/costTracker'
import { GENRE_PRESETS } from '../utils/genrePresets'
import { LANGUAGES } from '../utils/languageConfig'
import { planFeatures } from '../utils/planFeatures'

// ── Cost badge ─────────────────────────────────────────────────────────────
function CostBadge({ free }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', padding: '1px 6px',
      letterSpacing: '1px', textTransform: 'uppercase',
      border: `1px solid ${free ? '#3a7a4a' : '#8a6420'}`,
      color: free ? '#6dc87a' : 'var(--gold)',
      marginLeft: '6px', verticalAlign: 'middle',
    }}>
      {free ? '🖥 FREE' : '☁ PAID'}
    </span>
  )
}
CostBadge.propTypes = { free: PropTypes.bool.isRequired }

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '26px' }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}
Section.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node.isRequired }

// ── Provider radio row ─────────────────────────────────────────────────────
function ProviderRow({ id, label, sublabel, free, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: '3px', flexShrink: 0, accentColor: 'var(--gold)' }} />
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: checked ? 'var(--cream)' : 'var(--muted)', letterSpacing: '0.5px' }}>
          {label}<CostBadge free={free} />
        </div>
        {sublabel && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginTop: '2px' }}>{sublabel}</div>}
      </div>
    </label>
  )
}
ProviderRow.propTypes = { id: PropTypes.string.isRequired, label: PropTypes.string.isRequired, sublabel: PropTypes.string, free: PropTypes.bool, checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired }

// ── API key input ──────────────────────────────────────────────────────────
function KeyInput({ name, label, placeholder, hint, value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: '#0a0806', border: `1px solid ${value ? '#3a7a4a' : 'var(--border)'}`, color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none' }} />
        <button onClick={() => setShow(s => !s)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '0 8px', cursor: 'pointer', fontSize: '12px' }}>
          {show ? '👁' : '○'}
        </button>
      </div>
      {hint && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#3a4a5a', marginTop: '3px' }}>{hint}</div>}
    </div>
  )
}
KeyInput.propTypes = { name: PropTypes.string.isRequired, label: PropTypes.string.isRequired, placeholder: PropTypes.string.isRequired, hint: PropTypes.string, value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired }

// ── Local URL input ────────────────────────────────────────────────────────
function UrlInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none' }} />
    </div>
  )
}
UrlInput.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, placeholder: PropTypes.string.isRequired }

// ── SettingsPanel ──────────────────────────────────────────────────────────
const CLOUD_KEYS = [
  { name: 'anthropic',   label: 'Anthropic (Claude)',   placeholder: 'sk-ant-api03-…',      hint: 'console.anthropic.com/settings/keys' },
  { name: 'groq',        label: 'Groq',                 placeholder: 'gsk_…',               hint: 'console.groq.com — free tier available' },
  { name: 'deepseek',    label: 'DeepSeek',             placeholder: 'sk-…',                hint: 'platform.deepseek.com — ultra cheap' },
  { name: 'gemini',      label: 'Google Gemini',        placeholder: 'AIza…',               hint: 'aistudio.google.com — free tier available' },
  { name: 'falai',       label: 'fal.ai',               placeholder: 'fal_…',               hint: 'fal.ai/dashboard — images + videos' },
  { name: 'openai',      label: 'OpenAI',               placeholder: 'sk-proj-…',           hint: 'platform.openai.com — DALL·E 3 + TTS' },
  { name: 'replicate',   label: 'Replicate',            placeholder: 'r8_…',                hint: 'replicate.com/account/api-tokens' },
  { name: 'stabilityai', label: 'Stability AI',         placeholder: 'sk-…',               hint: 'platform.stability.ai — SD3.5' },
  { name: 'lumaai',      label: 'Luma AI',              placeholder: 'luma-…',              hint: 'lumalabs.ai/dream-machine/api' },
  { name: 'minimax',     label: 'MiniMax (Hailuo)',     placeholder: 'eyJ…',                hint: 'platform.minimax.io' },
  { name: 'klingdirect', label: 'Kling AI Direct',      placeholder: 'klingai_…',           hint: 'klingai.com/dev — no fal.ai markup' },
  { name: 'runway',      label: 'Runway ML',            placeholder: 'key_…',               hint: 'app.runwayml.com/account/api' },
  { name: 'elevenlabs',  label: 'ElevenLabs',           placeholder: 'Your API key',        hint: 'elevenlabs.io/app/settings' },
  { name: 'googletts',   label: 'Google Cloud TTS',     placeholder: 'AIza…',               hint: 'console.cloud.google.com — very cheap' },
]

const VIDEO_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard 720p',            sub: 'Faster & cheaper — good for drafts' },
  { value: 'hd',       label: 'HD 1080p (Recommended)',   sub: 'Best quality/cost balance' },
  { value: 'master',   label: 'Master / 4K',              sub: 'Highest quality — Kling v2 / premium' },
]
const IMAGE_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard',                 sub: 'Fast generation — good for previews' },
  { value: 'hd',       label: 'HD (Recommended)',         sub: 'FLUX Pro / DALL·E HD quality' },
  { value: 'ultra',    label: 'Ultra — 4 MP',             sub: 'Maximum resolution — FLUX Pro Ultra' },
]
const DURATION_OPTIONS = [
  { value: '5',  label: '5 seconds',  sub: 'Standard clip length' },
  { value: '10', label: '10 seconds', sub: 'Longer takes — ~2× cost' },
]
const GENERATION_MODES = {
  'on-demand': { label: 'On-Demand',              sub: 'Generate each asset individually.' },
  'hybrid':    { label: 'Hybrid (Recommended)',   sub: 'Batch images + voice. Videos per-scene.' },
  'batch':     { label: 'Full Batch',             sub: 'Generate all at once with cost estimate.' },
}

export default function SettingsPanel({ onClose }) {
  const { settings, updateSettings } = useSettings()
  const { activeWorkspacePlan } = useAuth()
  const hasPremium = planFeatures(activeWorkspacePlan).premium

  const setKey     = (name, val) => updateSettings({ apiKeys:   { [name]: val } })
  const setUrl     = (name, val) => updateSettings({ localUrls: { [name]: val } })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }} onClick={onClose}>
      <div style={{ flex: 1 }} />
      <div style={{ width: '400px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>SETTINGS</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px', flex: 1 }}>

          {/* ── GENERATION MODE ─────────────────────────────────────── */}
          <Section title="Generation Mode">
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {[['byok', 'BYO Key'], ['managed', 'Managed']].map(([val, label]) => (
                <button key={val} onClick={() => updateSettings({ mode: val })} style={{
                  flex: 1, padding: '8px 10px',
                  background: settings.mode === val ? 'rgba(200,146,42,0.12)' : 'transparent',
                  border: `1px solid ${settings.mode === val ? 'var(--gold)' : 'var(--border)'}`,
                  color: settings.mode === val ? 'var(--gold)' : 'var(--muted)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                  letterSpacing: '1px', cursor: 'pointer', textTransform: 'uppercase',
                }}>
                  {label}
                </button>
              ))}
            </div>
            {settings.mode === 'managed' && (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {[['standard', 'Standard'], ['premium', 'Premium']].map(([val, label]) => {
                    const isLocked = val === 'premium' && !hasPremium
                    const isActive = settings.managedTier === val
                    return (
                      <button
                        key={val}
                        onClick={() => { if (!isLocked) updateSettings({ managedTier: val }) }}
                        disabled={isLocked}
                        title={isLocked ? 'Requires Pro or Studio plan' : undefined}
                        style={{
                          flex: 1, padding: '7px 10px',
                          background: isActive && !isLocked ? 'rgba(200,146,42,0.12)' : 'transparent',
                          border: `1px solid ${isActive && !isLocked ? 'var(--gold)' : 'var(--border)'}`,
                          color: isLocked ? 'var(--muted)' : isActive ? 'var(--gold)' : 'var(--muted)',
                          fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                          letterSpacing: '1px',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          textTransform: 'uppercase',
                          opacity: isLocked ? 0.5 : 1,
                          position: 'relative',
                        }}
                      >
                        {label}
                        {isLocked && (
                          <span style={{ marginLeft: '5px', fontSize: '8px', color: 'var(--muted)', letterSpacing: '0.5px' }}>🔒 Pro</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', lineHeight: '1.6' }}>
                  Managed mode runs generation on our servers (no API key needed). Requires your workspace to be enabled for managed beta.
                </div>
              </>
            )}
          </Section>

          {/* ── TEXT GENERATION ─────────────────────────────────────── */}
          <Section title="Text Generation (Series Script)">
            {Object.entries(TEXT_PROVIDERS).map(([key, p]) => (
              <ProviderRow key={key} id={key} label={p.label} sublabel={p.badge} free={p.free}
                checked={settings.textProvider === key} onChange={() => updateSettings({ textProvider: key })} />
            ))}
            {settings.textProvider === 'ollama' && (
              <>
                <UrlInput label="Ollama URL" value={settings.localUrls?.ollama ?? 'http://localhost:11434'} onChange={v => setUrl('ollama', v)} placeholder="http://localhost:11434" />
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>Model</div>
                  <input type="text" value={settings.textModel || ''} onChange={e => updateSettings({ textModel: e.target.value })} placeholder="llama3.1 (default)"
                    style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none' }} />
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#3a4a5a', marginTop: '3px' }}>Run: ollama pull llama3.1 · or try gemma3, mistral, qwen2.5</div>
                </div>
              </>
            )}
          </Section>

          {/* ── OUTPUT LANGUAGE ─────────────────────────────────────── */}
          <Section title="Output Language">
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginBottom: '10px' }}>
              All generated text (dialogue, titles, captions) will be in the selected language.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => updateSettings({ language: lang.code })} style={{
                  background: settings.language === lang.code ? 'rgba(200,146,42,0.1)' : 'transparent',
                  border: `1px solid ${settings.language === lang.code ? 'var(--gold)' : 'var(--border)'}`,
                  color: settings.language === lang.code ? 'var(--gold)' : 'var(--muted)',
                  padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                  letterSpacing: '0.5px', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center',
                }}>
                  <span>{lang.flag}</span><span>{lang.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* ── IMAGE PROVIDERS ─────────────────────────────────────── */}
          <Section title="Image Generation">
            <div style={{ marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>☁ CLOUD</div>
            {Object.entries(IMAGE_PROVIDERS).filter(([, p]) => p.tier === 'cloud').map(([key, p]) => {
              const cost = PROVIDER_COSTS.image[key]
              const sub = cost ? `$${cost.hd}/image HD` : ''
              return <ProviderRow key={key} id={key} label={p.label} sublabel={sub} free={false}
                checked={settings.imageProvider === key} onChange={() => updateSettings({ imageProvider: key })} />
            })}
            <div style={{ margin: '10px 0 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>🖥 SELF-HOSTED (FREE)</div>
            {Object.entries(IMAGE_PROVIDERS).filter(([, p]) => p.tier === 'local').map(([key, p]) => (
              <ProviderRow key={key} id={key} label={p.label} sublabel="Zero cost after hardware" free={true}
                checked={settings.imageProvider === key} onChange={() => updateSettings({ imageProvider: key })} />
            ))}
            {settings.imageProvider === 'a1111' && <UrlInput label="A1111 URL" value={settings.localUrls?.a1111 ?? ''} onChange={v => setUrl('a1111', v)} placeholder="http://localhost:7860" />}
            {settings.imageProvider === 'comfyui' && (
              <>
                <UrlInput label="ComfyUI URL" value={settings.localUrls?.comfyui ?? ''} onChange={v => setUrl('comfyui', v)} placeholder="http://localhost:8188" />
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>FLUX Model filename</div>
                  <input type="text" value={settings.comfyFluxModel || ''} onChange={e => updateSettings({ comfyFluxModel: e.target.value })} placeholder="flux1-dev-fp8.safetensors"
                    style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none' }} />
                </div>
              </>
            )}
          </Section>

          {/* ── IMAGE QUALITY ────────────────────────────────────────── */}
          <Section title="Image Quality">
            {IMAGE_QUALITY_OPTIONS.map(({ value, label, sub }) => {
              const costs = PROVIDER_COSTS.image[settings.imageProvider]
              const price = costs ? `· $${costs[value] ?? 0}/img` : ''
              return (
                <ProviderRow key={value} id={value} label={label} sublabel={`${sub} ${price}`}
                  free={isFree('image', settings.imageProvider)}
                  checked={settings.imageQuality === value} onChange={() => updateSettings({ imageQuality: value })} />
              )
            })}
          </Section>

          {/* ── VIDEO PROVIDERS ─────────────────────────────────────── */}
          <Section title="Video Generation">
            <div style={{ marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>☁ CLOUD</div>
            {Object.entries(VIDEO_PROVIDERS).filter(([, p]) => p.tier === 'cloud').map(([key, p]) => {
              const cost = PROVIDER_COSTS.video[key]
              const sub = cost ? `$${cost.hd}/clip HD` : ''
              return <ProviderRow key={key} id={key} label={p.label} sublabel={sub} free={false}
                checked={settings.videoProvider === key} onChange={() => updateSettings({ videoProvider: key })} />
            })}
            <div style={{ margin: '10px 0 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>🖥 SELF-HOSTED (FREE)</div>
            {Object.entries(VIDEO_PROVIDERS).filter(([, p]) => p.tier === 'local').map(([key, p]) => (
              <ProviderRow key={key} id={key} label={p.label} sublabel="CogVideoX · Wan2.1 · LTX-Video · Gradio API" free={true}
                checked={settings.videoProvider === key} onChange={() => updateSettings({ videoProvider: key })} />
            ))}
            {settings.videoProvider === 'localvideo' && <UrlInput label="Local Video URL" value={settings.localUrls?.localvideo ?? ''} onChange={v => setUrl('localvideo', v)} placeholder="http://localhost:7861" />}
          </Section>

          {/* ── VIDEO QUALITY + DURATION ─────────────────────────────── */}
          <Section title="Video Quality">
            {VIDEO_QUALITY_OPTIONS.map(({ value, label, sub }) => {
              const costs = PROVIDER_COSTS.video[settings.videoProvider]
              const price = costs ? `· $${costs[value] ?? 0}/clip` : ''
              return (
                <ProviderRow key={value} id={value} label={label} sublabel={`${sub} ${price}`}
                  free={isFree('video', settings.videoProvider)}
                  checked={settings.videoQuality === value} onChange={() => updateSettings({ videoQuality: value })} />
              )
            })}
          </Section>

          <Section title="Video Duration">
            {DURATION_OPTIONS.map(({ value, label, sub }) => (
              <ProviderRow key={value} id={value} label={label} sublabel={sub} free={isFree('video', settings.videoProvider)}
                checked={settings.videoDuration === value} onChange={() => updateSettings({ videoDuration: value })} />
            ))}
          </Section>

          {/* ── VOICE PROVIDERS ─────────────────────────────────────── */}
          <Section title="Voice Generation">
            <div style={{ marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>☁ CLOUD</div>
            {Object.entries(VOICE_PROVIDERS).filter(([, p]) => p.tier === 'cloud').map(([key, p]) => {
              const rate = PROVIDER_COSTS.voice[key]
              const sub = rate ? `$${(rate * 1000).toFixed(3)}/1K chars` : ''
              return <ProviderRow key={key} id={key} label={p.label} sublabel={sub} free={false}
                checked={settings.voiceProvider === key} onChange={() => updateSettings({ voiceProvider: key })} />
            })}
            <div style={{ margin: '10px 0 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', letterSpacing: '1px' }}>🖥 SELF-HOSTED (FREE)</div>
            {Object.entries(VOICE_PROVIDERS).filter(([, p]) => p.tier === 'local').map(([key, p]) => (
              <ProviderRow key={key} id={key} label={p.label} sublabel="Zero cost — runs on CPU" free={true}
                checked={settings.voiceProvider === key} onChange={() => updateSettings({ voiceProvider: key })} />
            ))}
            {settings.voiceProvider === 'kokoro' && <UrlInput label="Kokoro URL" value={settings.localUrls?.kokoro ?? ''} onChange={v => setUrl('kokoro', v)} placeholder="http://localhost:8880" />}
            {settings.voiceProvider === 'xtts' && <UrlInput label="XTTS-v2 URL" value={settings.localUrls?.xtts ?? ''} onChange={v => setUrl('xtts', v)} placeholder="http://localhost:8020" />}
          </Section>

          {/* ── ASPECT RATIO ─────────────────────────────────────────── */}
          <Section title="Aspect Ratio">
            {[['9:16','Portrait 9:16 (TikTok / Reels)'],['16:9','Landscape 16:9 (YouTube)'],['1:1','Square 1:1 (Instagram)']].map(([val, label]) => (
              <ProviderRow key={val} id={val} label={label} free={true}
                checked={settings.aspectRatio === val} onChange={() => updateSettings({ aspectRatio: val })} />
            ))}
          </Section>

          {/* ── GENERATION MODE ──────────────────────────────────────── */}
          <Section title="Generation Mode">
            {Object.entries(GENERATION_MODES).map(([key, { label, sub }]) => (
              <ProviderRow key={key} id={key} label={label} sublabel={sub} free={true}
                checked={settings.generationMode === key} onChange={() => updateSettings({ generationMode: key })} />
            ))}
          </Section>

          {/* ── VARIATIONS ───────────────────────────────────────────── */}
          <Section title="Variations per Asset">
            {[[1,'1 — Single generation'],[2,'2 — A/B comparison'],[3,'3 — Best of three']].map(([val, label]) => (
              <ProviderRow key={val} id={String(val)} label={label} free={isFree('image', settings.imageProvider) && isFree('video', settings.videoProvider)}
                checked={settings.variations === val} onChange={() => updateSettings({ variations: val })} />
            ))}
          </Section>

          {/* ── GENRE PRESET ─────────────────────────────────────────── */}
          <Section title="Genre / Style Preset">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {Object.entries(GENRE_PRESETS).map(([key, preset]) => (
                <button key={key} onClick={() => updateSettings({ genrePreset: key })} style={{
                  background: settings.genrePreset === key ? 'rgba(200,146,42,0.1)' : 'transparent',
                  border: `1px solid ${settings.genrePreset === key ? 'var(--gold)' : 'var(--border)'}`,
                  color: settings.genrePreset === key ? 'var(--gold)' : 'var(--muted)',
                  padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                  letterSpacing: '1px', cursor: 'pointer', textAlign: 'left',
                }}>
                  {preset.emoji} {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ── API KEYS ─────────────────────────────────────────────── */}
          <Section title="API Keys — Cloud Providers">
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginBottom: '12px', lineHeight: '1.6' }}>
              Keys are stored locally in your browser only. Self-hosted providers need no key.
            </div>
            {CLOUD_KEYS.map(({ name, label, placeholder, hint }) => (
              <KeyInput key={name} name={name} label={label} placeholder={placeholder} hint={hint}
                value={settings.apiKeys[name] ?? ''} onChange={v => setKey(name, v)} />
            ))}
          </Section>

          {/* ── WHITE LABEL ──────────────────────────────────────────── */}
          <Section title="White Label / Agency">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.whiteLabel.enabled} onChange={e => updateSettings({ whiteLabel: { enabled: e.target.checked } })} style={{ accentColor: 'var(--gold)' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--cream)' }}>Enable white-labelling</span>
            </label>
            {settings.whiteLabel.enabled && (
              <>
                {[['appName','App Name','BookFilm Studio'],['logoUrl','Logo URL','https://…']].map(([field, label, ph]) => (
                  <div key={field} style={{ marginBottom: '10px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
                    <input type="text" value={settings.whiteLabel[field] || ''} onChange={e => updateSettings({ whiteLabel: { [field]: e.target.value } })} placeholder={ph}
                      style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none' }} />
                  </div>
                ))}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px', textTransform: 'uppercase' }}>Primary Colour</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="color" value={settings.whiteLabel.primaryColor || '#c8922a'} onChange={e => updateSettings({ whiteLabel: { primaryColor: e.target.value } })} style={{ width: '36px', height: '28px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: '2px' }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)' }}>{settings.whiteLabel.primaryColor || '#c8922a'}</span>
                  </div>
                </div>
              </>
            )}
          </Section>

        </div>
      </div>
    </div>
  )
}

SettingsPanel.propTypes = { onClose: PropTypes.func.isRequired }
