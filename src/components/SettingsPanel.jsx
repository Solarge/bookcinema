import { useRef } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../contexts/SettingsContext'
import { useAuth } from '../contexts/AuthContext'
import { useDivModalA11y } from '../hooks/useModalA11y'
import { GENRE_PRESETS } from '../utils/genrePresets'
import { LANGUAGES } from '../utils/languageConfig'
import { planFeatures } from '../utils/planFeatures'
import '../styles/settings.css'

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="set-section">
      <div className="set-section-title">{title}</div>
      {children}
    </div>
  )
}
Section.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node.isRequired }

// ── Radio row ──────────────────────────────────────────────────────────────
function OptionRow({ label, sublabel, checked, onChange }) {
  return (
    <label className="set-option-row">
      <input type="radio" checked={checked} onChange={onChange} className="set-option-radio" />
      <div>
        <div className={`set-option-label${checked ? ' is-checked' : ''}`}>
          {label}
        </div>
        {sublabel && <div className="set-option-sublabel">{sublabel}</div>}
      </div>
    </label>
  )
}
OptionRow.propTypes = { label: PropTypes.string.isRequired, sublabel: PropTypes.string, checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired }

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

  const isAuto = settings.episodeCount === 'auto' || settings.episodeCount == null

  return (
    <div className="set-overlay" role="presentation" onClick={onClose} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClose()}>
      <div className="set-overlay-spacer" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        className="set-panel"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="set-header">
          <span id="settings-panel-title" className="set-header-title">GENERATION SETTINGS</span>
          <button onClick={onClose} aria-label="Close settings" className="set-close-btn">×</button>
        </div>

        <div className="set-body">

          {/* ── GENERATION TIER ─────────────────────────────────────── */}
          <Section title="Generation Tier">
            <div className="set-tab-row">
              {[['standard', 'Standard'], ['premium', 'Premium']].map(([val, label]) => {
                const isLocked = val === 'premium' && !hasPremium
                const isActive = settings.managedTier === val
                return (
                  <button
                    key={val}
                    onClick={() => { if (!isLocked) updateSettings({ managedTier: val }) }}
                    disabled={isLocked}
                    title={isLocked ? 'Requires Pro or Studio plan — upgrade to unlock' : undefined}
                    className={`set-tab-btn${isActive && !isLocked ? ' is-active' : ''}`}
                  >
                    {label}
                    {isLocked && (
                      <span className="set-lock-badge">🔒 Pro</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="set-tier-desc">
              {hasPremium
                ? 'Premium tier uses higher-quality models for images, video, and voice.'
                : 'Upgrade to Pro or Studio to unlock Premium tier generation.'}
            </div>
          </Section>

          {/* ── EPISODES ────────────────────────────────────────────── */}
          <Section title="Episodes">
            <div className="set-hint">
              The book decides how many episodes (and how long each runs) it needs — or set a specific count.
            </div>
            <div className="set-ep-row">
              <button
                onClick={() => updateSettings({ episodeCount: 'auto' })}
                className={`set-tab-btn${isAuto ? ' is-active' : ''}`}
                aria-pressed={isAuto}
              >Auto — as the book needs</button>
              <button
                onClick={() => updateSettings({ episodeCount: 7 })}
                className={`set-tab-btn${!isAuto ? ' is-active' : ''}`}
                aria-pressed={!isAuto}
              >Custom</button>
            </div>
            {!isAuto && (
              <div className="set-ep-count-row">
                <input
                  type="number"
                  min={2}
                  max={24}
                  value={settings.episodeCount}
                  onChange={e => { const v = Math.min(24, Math.max(2, parseInt(e.target.value, 10) || 7)); updateSettings({ episodeCount: v }) }}
                  aria-label="Number of episodes"
                  className="set-ep-input"
                />
                <span className="set-ep-label">episodes</span>
              </div>
            )}
          </Section>

          {/* ── OUTPUT LANGUAGE ─────────────────────────────────────── */}
          <Section title="Output Language">
            <div className="set-hint">
              All generated text (dialogue, titles, captions) will be in the selected language.
            </div>
            <div className="set-grid-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => updateSettings({ language: lang.code })}
                  className={`set-sel-btn${settings.language === lang.code ? ' is-active' : ''}`}
                >
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
            <div className="set-grid-2">
              {Object.entries(GENRE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => updateSettings({ genrePreset: key })}
                  className={`set-genre-btn${settings.genrePreset === key ? ' is-active' : ''}`}
                >
                  {preset.emoji} {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ── WHITE LABEL ──────────────────────────────────────────── */}
          <Section title="White Label / Agency">
            <label className="set-wl-toggle-label">
              <input
                type="checkbox"
                checked={settings.whiteLabel.enabled}
                onChange={e => updateSettings({ whiteLabel: { enabled: e.target.checked } })}
                className="set-wl-toggle-checkbox"
              />
              <span className="set-wl-toggle-text">Enable white-labelling</span>
            </label>
            {settings.whiteLabel.enabled && (
              <>
                {[['appName','App Name','BookFilm Studio'],['logoUrl','Logo URL','https://…']].map(([field, label, ph]) => (
                  <div key={field} className="set-wl-field">
                    <div className="set-wl-field-label">{label}</div>
                    <input
                      type="text"
                      value={settings.whiteLabel[field] || ''}
                      onChange={e => updateSettings({ whiteLabel: { [field]: e.target.value } })}
                      placeholder={ph}
                      className="set-wl-input"
                    />
                  </div>
                ))}
                <div className="set-wl-field">
                  <div className="set-wl-field-label">Primary Colour</div>
                  <div className="set-color-row">
                    <input
                      type="color"
                      value={settings.whiteLabel.primaryColor || '#c8922a'}
                      onChange={e => updateSettings({ whiteLabel: { primaryColor: e.target.value } })}
                      className="set-color-picker"
                    />
                    <span className="set-color-value">{settings.whiteLabel.primaryColor || '#c8922a'}</span>
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
