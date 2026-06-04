import { useRef } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../contexts/SettingsContext'
import { useAuth } from '../contexts/AuthContext'
import { useDivModalA11y } from '../hooks/useModalA11y'
import { GENRE_PRESETS } from '../utils/genrePresets'
import { LANGUAGES } from '../utils/languageConfig'
import { planFeatures } from '../utils/planFeatures'

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

// ── Radio row ──────────────────────────────────────────────────────────────
function OptionRow({ id, label, sublabel, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: '3px', flexShrink: 0, accentColor: 'var(--gold)' }} />
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: checked ? 'var(--cream)' : 'var(--muted)', letterSpacing: '0.5px' }}>
          {label}
        </div>
        {sublabel && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginTop: '2px' }}>{sublabel}</div>}
      </div>
    </label>
  )
}
OptionRow.propTypes = { id: PropTypes.string.isRequired, label: PropTypes.string.isRequired, sublabel: PropTypes.string, checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired }

const VIDEO_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard 720p',          sub: 'Faster generation — good for drafts' },
  { value: 'hd',       label: 'HD 1080p (Recommended)', sub: 'Best quality/cost balance' },
  { value: 'master',   label: 'Master / 4K',            sub: 'Highest quality — premium tier' },
]
const IMAGE_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard',               sub: 'Fast generation — good for previews' },
  { value: 'hd',       label: 'HD (Recommended)',       sub: 'High-quality images' },
  { value: 'ultra',    label: 'Ultra — 4 MP',           sub: 'Maximum resolution' },
]
const DURATION_OPTIONS = [
  { value: '5',  label: '5 seconds',  sub: 'Standard clip length' },
  { value: '10', label: '10 seconds', sub: 'Longer takes — ~2× credit cost' },
]
const GENERATION_MODES = {
  'on-demand': { label: 'On-Demand',              sub: 'Generate each asset individually.' },
  'hybrid':    { label: 'Hybrid (Recommended)',   sub: 'Batch images + voice. Videos per-scene.' },
  'batch':     { label: 'Full Batch',             sub: 'Generate all at once.' },
}

// ── SettingsPanel ──────────────────────────────────────────────────────────
export default function SettingsPanel({ onClose }) {
  const { settings, updateSettings } = useSettings()
  const { activeWorkspacePlan } = useAuth()
  const hasPremium = planFeatures(activeWorkspacePlan).premium
  const panelRef = useRef(null)
  useDivModalA11y(onClose, panelRef)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }} role="presentation" onClick={onClose} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClose()}>
      <div style={{ flex: 1 }} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        style={{ width: '400px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
          <span id="settings-panel-title" style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>GENERATION SETTINGS</span>
          <button onClick={onClose} aria-label="Close settings" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px', flex: 1 }}>

          {/* ── GENERATION TIER ─────────────────────────────────────── */}
          <Section title="Generation Tier">
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {[['standard', 'Standard'], ['premium', 'Premium']].map(([val, label]) => {
                const isLocked = val === 'premium' && !hasPremium
                const isActive = settings.managedTier === val
                return (
                  <button
                    key={val}
                    onClick={() => { if (!isLocked) updateSettings({ managedTier: val }) }}
                    disabled={isLocked}
                    title={isLocked ? 'Requires Pro or Studio plan — upgrade to unlock' : undefined}
                    style={{
                      flex: 1, padding: '8px 10px',
                      background: isActive && !isLocked ? 'rgba(200,146,42,0.12)' : 'transparent',
                      border: `1px solid ${isActive && !isLocked ? 'var(--gold)' : 'var(--border)'}`,
                      color: isLocked ? 'var(--muted)' : isActive ? 'var(--gold)' : 'var(--muted)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
                      letterSpacing: '1px',
                      cursor: isLocked ? 'not-allowed' : 'pointer',
                      textTransform: 'uppercase',
                      opacity: isLocked ? 0.5 : 1,
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
              {hasPremium
                ? 'Premium tier uses higher-quality models for images, video, and voice.'
                : 'Upgrade to Pro or Studio to unlock Premium tier generation.'}
            </div>
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

          {/* ── IMAGE QUALITY ────────────────────────────────────────── */}
          <Section title="Image Quality">
            {IMAGE_QUALITY_OPTIONS.map(({ value, label, sub }) => (
              <OptionRow key={value} id={value} label={label} sublabel={sub}
                checked={settings.imageQuality === value} onChange={() => updateSettings({ imageQuality: value })} />
            ))}
          </Section>

          {/* ── VIDEO QUALITY ────────────────────────────────────────── */}
          <Section title="Video Quality">
            {VIDEO_QUALITY_OPTIONS.map(({ value, label, sub }) => (
              <OptionRow key={value} id={value} label={label} sublabel={sub}
                checked={settings.videoQuality === value} onChange={() => updateSettings({ videoQuality: value })} />
            ))}
          </Section>

          {/* ── VIDEO DURATION ───────────────────────────────────────── */}
          <Section title="Video Duration">
            {DURATION_OPTIONS.map(({ value, label, sub }) => (
              <OptionRow key={value} id={value} label={label} sublabel={sub}
                checked={settings.videoDuration === value} onChange={() => updateSettings({ videoDuration: value })} />
            ))}
          </Section>

          {/* ── ASPECT RATIO ─────────────────────────────────────────── */}
          <Section title="Aspect Ratio">
            {[['9:16','Portrait 9:16 (TikTok / Reels)'],['16:9','Landscape 16:9 (YouTube)'],['1:1','Square 1:1 (Instagram)']].map(([val, label]) => (
              <OptionRow key={val} id={val} label={label}
                checked={settings.aspectRatio === val} onChange={() => updateSettings({ aspectRatio: val })} />
            ))}
          </Section>

          {/* ── GENERATION SCHEDULE ──────────────────────────────────── */}
          <Section title="Generation Schedule">
            {Object.entries(GENERATION_MODES).map(([key, { label, sub }]) => (
              <OptionRow key={key} id={key} label={label} sublabel={sub}
                checked={settings.generationMode === key} onChange={() => updateSettings({ generationMode: key })} />
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
