import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { social as socialApi } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { planAllows, minPlanFor, planLabel } from '../../utils/plans'
import '../../styles/distribution.css'

// Platform display config
const PLATFORM_META = {
  youtube:   { label: 'YouTube',   icon: '▶' },
  tiktok:    { label: 'TikTok',    icon: '🎵' },
  instagram: { label: 'Instagram', icon: '📸' },
  facebook:  { label: 'Facebook',  icon: '👍' },
  x:         { label: 'X',         icon: '𝕏' },
  linkedin:  { label: 'LinkedIn',  icon: '💼' },
}

// Per-platform "how to get these keys" guidance (dev console + steps + scopes)
const PLATFORM_SETUP = {
  youtube: {
    console: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Create / pick a Google Cloud project',
      'Enable "YouTube Data API v3"',
      'Configure the OAuth consent screen',
      'Create an OAuth client ID → type "Web application"',
      'Add the redirect URL above to "Authorized redirect URIs"',
      'Copy the Client ID and Client Secret here',
    ],
    scopes: 'youtube.upload, youtube.readonly',
  },
  tiktok: {
    console: 'https://developers.tiktok.com/',
    steps: [
      'Create an app in the TikTok developer portal',
      'Add the "Login Kit" and "Content Posting API" products',
      'Add the redirect URL above as a redirect URI',
      'Copy the Client Key and Client Secret here',
    ],
    scopes: 'user.info.basic, video.publish',
  },
  instagram: {
    console: 'https://developers.facebook.com/apps',
    steps: [
      'Create a Meta app (type: Business)',
      'Add the "Instagram Graph API" + "Facebook Login" products',
      'Under Facebook Login → Settings, add the redirect URL above to "Valid OAuth Redirect URIs"',
      'Copy the App ID and App Secret here',
      'Note: you need an Instagram Business/Creator account linked to a Facebook Page',
    ],
    scopes: 'instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement',
  },
  facebook: {
    console: 'https://developers.facebook.com/apps',
    steps: [
      'Create a Meta app (type: Business)',
      'Add the "Facebook Login" product',
      'Add the redirect URL above to "Valid OAuth Redirect URIs"',
      'Copy the App ID and App Secret here',
    ],
    scopes: 'pages_show_list, pages_read_engagement, pages_manage_posts',
  },
  x: {
    console: 'https://developer.twitter.com/en/portal/dashboard',
    steps: [
      'Create a Project and an App',
      'Open "User authentication settings" → enable OAuth 2.0, app type "Web App"',
      'Add the redirect URL above as a Callback URI',
      'Copy the OAuth 2.0 Client ID and Client Secret here',
    ],
    scopes: 'tweet.read, tweet.write, users.read, offline.access, media.write',
  },
  linkedin: {
    console: 'https://www.linkedin.com/developers/apps',
    steps: [
      'Create an app',
      'Request the "Share on LinkedIn" + "Sign In with LinkedIn" products',
      'On the Auth tab, add the redirect URL above as an authorized redirect URL',
      'Copy the Client ID and Client Secret here',
    ],
    scopes: 'openid, profile, w_member_social',
  },
}

const STATUS_COLORS = {
  scheduled:  { bg: '#0a1a2a', border: '#3a6a9a', text: '#7ab0d8' },
  processing: { bg: '#1a1a0a', border: '#9a8a3a', text: '#d8c070' },
  posted:     { bg: '#0a2010', border: '#3a7a4a', text: '#6dc87a' },
  failed:     { bg: '#2a0808', border: '#8a3a3a', text: '#d87070' },
  cancelled:  { bg: '#0a0a0a', border: '#3a3a3a', text: '#666' },
}

// Status badges are fully dynamic (color depends on status value), keep inline
function statusStyle(status) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.scheduled
  return {
    display: 'inline-block',
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    padding: '2px 8px',
  }
}

const SETUP_GUIDE_URL = 'https://github.com/Solarge/bookcinema/blob/main/docs/SOCIAL-SETUP.md'

// ── Per-platform credential setup form (inline, expandable) ────────────────
function CredentialForm({ provider, prefill, onSaved, onCancel, onMsg }) {
  const meta   = PLATFORM_META[provider.key] ?? { label: provider.label, icon: '📡' }
  const setup  = PLATFORM_SETUP[provider.key]
  const fields = provider.credentialFields ?? []
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, prefill?.[f.key] ?? '']))
  )
  const [missing, setMissing] = useState([])
  const [saving,  setSaving]  = useState(false)
  const [copied,  setCopied]  = useState(false)

  function setField(key, val) {
    setValues(prev => ({ ...prev, [key]: val }))
    if (missing.includes(key)) setMissing(prev => prev.filter(k => k !== key))
  }

  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(provider.redirectUri ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      onMsg('Could not copy — select the URL and copy it manually.')
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setMissing([])
    setSaving(true)
    try {
      // Drop blank values so editing keys (secrets left blank) doesn't overwrite.
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => String(v).trim() !== '')
      )
      await socialApi.saveCredentials(provider.key, payload)
      onMsg(`${meta.label} keys saved.`)
      onSaved()
    } catch (err) {
      if (err.code === 'plan_feature' || err.status === 403) {
        const reqLabel = err.requiredPlan ? planLabel(err.requiredPlan) : 'a higher'
        onMsg(`Connecting ${meta.label} requires the ${reqLabel} plan or higher.`)
      } else if (err.status === 400 && Array.isArray(err.missing)) {
        setMissing(err.missing)
        const labels = err.missing
          .map(k => fields.find(f => f.key === k)?.label ?? k)
          .join(', ')
        onMsg(`Missing required ${meta.label} field(s): ${labels}.`)
      } else {
        onMsg(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="dist-cred-form" onSubmit={handleSave}>
      {/* Read-only redirect URL the tenant must whitelist in their own app */}
      <div className="dist-cred-field">
        <label className="dist-field-label">Redirect URL</label>
        <div className="dist-cred-redirect">
          <input
            type="text"
            readOnly
            value={provider.redirectUri ?? ''}
            className="dist-input dist-cred-redirect__input"
            onFocus={e => e.target.select()}
          />
          <button
            type="button"
            onClick={copyRedirect}
            className="dist-btn dist-btn--secondary dist-cred-copy"
          >{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="dist-cred-help">
          Add this redirect URL to your {meta.label} app, then paste your app&apos;s keys here.{' '}
          <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer"
            className="dist-cred-help__link">Setup guide</a>
        </div>
      </div>

      {/* Collapsible per-platform "how to get these keys" guidance */}
      {setup && (
        <details className="dist-cred-howto">
          <summary className="dist-cred-howto__summary">How to get these keys</summary>
          <div className="dist-cred-howto__body">
            <a href={setup.console} target="_blank" rel="noopener noreferrer"
              className="dist-cred-howto__link">
              Open {meta.label} developer console ↗
            </a>
            <ol className="dist-cred-howto__steps">
              {setup.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <div className="dist-cred-howto__scopes">
              Scopes/permissions to enable: {setup.scopes}
            </div>
            <div className="dist-cred-howto__note">
              Each platform requires app review before it will allow posting to real accounts.
            </div>
          </div>
        </details>
      )}

      {/* One input per credential field */}
      {fields.map(field => (
        <div key={field.key} className="dist-cred-field">
          <label htmlFor={`dist-cred-${provider.key}-${field.key}`} className="dist-field-label">
            {field.label}
          </label>
          <input
            id={`dist-cred-${provider.key}-${field.key}`}
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[field.key] ?? ''}
            onChange={e => setField(field.key, e.target.value)}
            placeholder={field.secret && prefill ? '•••••• (unchanged)' : field.label}
            className="dist-input"
            style={missing.includes(field.key) ? { borderColor: '#8b1a1a' } : undefined}
          />
        </div>
      ))}

      <div className="dist-cred-actions">
        <button type="submit" disabled={saving} className="dist-btn dist-btn--primary">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="dist-btn dist-btn--secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}

CredentialForm.propTypes = {
  provider: PropTypes.object.isRequired,
  prefill:  PropTypes.object,
  onSaved:  PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onMsg:    PropTypes.func.isRequired,
}

// ── A single platform row (3-state: not configured → configured → connected) ─
function PlatformRow({ provider, account, onMsg, onRefresh }) {
  const meta = PLATFORM_META[provider.key] ?? { label: provider.label, icon: '📡' }
  const [editing,       setEditing]       = useState(false)
  const [connecting,    setConnecting]    = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [removing,      setRemoving]      = useState(false)

  // Non-secret keys already set, used to prefill the edit form (secrets stay blank).
  const [prefill, setPrefill] = useState(null)

  async function openEdit() {
    setPrefill(null)
    try {
      const { setKeys = [] } = await socialApi.credentials(provider.key)
      const fields = provider.credentialFields ?? []
      // Prefill only non-secret fields that are already set.
      const pf = {}
      for (const f of fields) {
        if (!f.secret && setKeys.includes(f.key)) pf[f.key] = ''
      }
      setPrefill(pf)
    } catch {
      setPrefill({})
    }
    setEditing(true)
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const { url } = await socialApi.connect(provider.key)
      window.location.assign(url) // hand off to the platform OAuth consent screen
    } catch (err) {
      if (err.code === 'not_configured' || err.status === 400) {
        onMsg(`${meta.label} isn't set up yet — add your developer-app keys first.`)
      } else {
        onMsg(err.message)
      }
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await socialApi.disconnect(account.id)
      onMsg(`${meta.label} disconnected.`)
      onRefresh()
    } catch (err) {
      onMsg(err.message)
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleRemoveKeys() {
    if (!window.confirm(`Remove your ${meta.label} developer-app keys? You'll need to re-enter them to connect again.`)) return
    setRemoving(true)
    try {
      await socialApi.deleteCredentials(provider.key)
      onMsg(`${meta.label} keys removed.`)
      onRefresh()
    } catch (err) {
      onMsg(err.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="dist-account-row dist-account-row--col">
      <div className="dist-account-row__main">
        <span className="dist-account-icon">{meta.icon}</span>
        <div className="dist-account-meta">
          <div className="dist-account-label">{meta.label}</div>
          {account && (
            <div className="dist-account-connected">{account.displayName}</div>
          )}
        </div>

        {/* Actions vary by state */}
        <div className="dist-account-actions">
          {!provider.configured ? (
            !editing && (
              <button onClick={() => { setPrefill(null); setEditing(true) }}
                className="dist-btn dist-btn--secondary">
                ⚙ Set up
              </button>
            )
          ) : account ? (
            <>
              <button onClick={openEdit} disabled={editing}
                className="dist-btn dist-btn--secondary">Edit keys</button>
              <button onClick={handleDisconnect} disabled={disconnecting}
                className="dist-btn dist-btn--danger">
                {disconnecting ? '…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleConnect} disabled={connecting}
                className="dist-btn dist-btn--secondary">
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button onClick={openEdit} disabled={editing}
                className="dist-btn dist-btn--secondary">Edit keys</button>
              <button onClick={handleRemoveKeys} disabled={removing}
                className="dist-btn dist-btn--danger">
                {removing ? '…' : 'Remove keys'}
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <CredentialForm
          provider={provider}
          prefill={prefill}
          onMsg={onMsg}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); onRefresh() }}
        />
      )}
    </div>
  )
}

PlatformRow.propTypes = {
  provider:  PropTypes.object.isRequired,
  account:   PropTypes.object,
  onMsg:     PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
}

// ── Connect Accounts section ───────────────────────────────────────────────
function ConnectAccounts({ providers, accounts, onMsg, onRefresh }) {
  return (
    <div className="dist-accounts">
      <div className="dist-section-head">Connected Accounts</div>
      <p className="dist-accounts-intro">
        Connect your accounts to auto-post finished videos. Set up each platform
        with your own developer-app keys, then connect.
      </p>
      <div className="dist-accounts-list">
        {providers.map(p => (
          <PlatformRow
            key={p.key}
            provider={p}
            account={accounts.find(a => a.platform === p.key)}
            onMsg={onMsg}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  )
}

ConnectAccounts.propTypes = {
  providers: PropTypes.array.isRequired,
  accounts:  PropTypes.array.isRequired,
  onMsg:     PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
}

// ── Schedule Post form ─────────────────────────────────────────────────────
function SchedulePostForm({ accounts, videoOptions, onMsg, onPosted }) {
  const connectedPlatforms = accounts.map(a => a.platform)

  const [videoUrl,     setVideoUrl]     = useState(videoOptions?.[0]?.url ?? '')
  const [useDropdown,  setUseDropdown]  = useState((videoOptions?.length ?? 0) > 0)
  const [title,        setTitle]        = useState('')
  const [caption,      setCaption]      = useState('')
  const [targets,      setTargets]      = useState(connectedPlatforms)
  const [scheduledAt,  setScheduledAt]  = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  // Keep targets in sync when accounts change
  useEffect(() => {
    setTargets(prev => prev.filter(p => connectedPlatforms.includes(p)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length])

  function toggleTarget(platform) {
    setTargets(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!videoUrl.trim()) return onMsg('Video URL is required.')
    if (!title.trim())    return onMsg('Title is required.')
    if (!scheduledAt)     return onMsg('Scheduled time is required.')
    if (targets.length === 0) return onMsg('Select at least one connected platform.')

    setSubmitting(true)
    try {
      await socialApi.createPost({
        videoUrl: videoUrl.trim(),
        title:    title.trim(),
        caption:  caption.trim(),
        targets,
        scheduledAt: new Date(scheduledAt).toISOString(),
      })
      onMsg('Post scheduled successfully.')
      setTitle(''); setCaption(''); setScheduledAt('')
      onPosted()
    } catch (err) {
      // 422 invalid targets, 400 bad request (e.g. past time) — err.message comes from body.error
      if (err.status === 422 || err.status === 400) {
        onMsg(err.message || 'Invalid request — check the scheduled time and connected accounts.')
      } else {
        onMsg(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const ALL_PLATFORMS = Object.keys(PLATFORM_META)

  return (
    <div className="dist-form-section">
      <div className="dist-section-head">Schedule a Post</div>
      <form onSubmit={handleSubmit} className="dist-form">

        {/* Video URL */}
        <div>
          <label htmlFor="dist-video-url" className="dist-field-label">Video URL</label>
          {(videoOptions?.length ?? 0) > 0 && (
            <div className="dist-url-switch">
              <button type="button" onClick={() => setUseDropdown(true)}
                className={`dist-btn dist-btn--sm ${useDropdown ? 'dist-btn--secondary' : 'dist-btn--primary'}`}>
                Pick Generated
              </button>
              <button type="button" onClick={() => setUseDropdown(false)}
                className={`dist-btn dist-btn--sm ${!useDropdown ? 'dist-btn--secondary' : 'dist-btn--primary'}`}>
                Paste URL
              </button>
            </div>
          )}
          {useDropdown && (videoOptions?.length ?? 0) > 0 ? (
            <select
              id="dist-video-url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              className="dist-input dist-input--select"
            >
              {videoOptions.map(opt => (
                <option key={opt.url} value={opt.url}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              id="dist-video-url"
              type="url"
              placeholder="https://…"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              className="dist-input"
            />
          )}
          {videoUrl && (
            <div className="dist-url-hint">{videoUrl}</div>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="dist-title" className="dist-field-label">Title</label>
          <input
            id="dist-title"
            type="text"
            placeholder="Post title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="dist-input"
          />
        </div>

        {/* Caption */}
        <div>
          <label htmlFor="dist-caption" className="dist-field-label">Caption</label>
          <textarea
            id="dist-caption"
            placeholder="Caption / description…"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={3}
            className="dist-input"
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Target platforms */}
        <div>
          <label className="dist-field-label">Target Platforms</label>
          <div className="dist-platform-pills">
            {ALL_PLATFORMS.map(platform => {
              const meta       = PLATFORM_META[platform]
              const connected  = connectedPlatforms.includes(platform)
              const checked    = targets.includes(platform)

              return (
                <button
                  key={platform}
                  type="button"
                  disabled={!connected}
                  onClick={() => connected && toggleTarget(platform)}
                  title={connected ? undefined : 'Connect this platform first'}
                  className="dist-platform-pill"
                  style={{
                    border: `1px solid ${checked && connected ? 'var(--gold)' : 'var(--border)'}`,
                    background: checked && connected ? 'rgba(200,160,80,0.12)' : 'transparent',
                    color: connected ? (checked ? 'var(--gold)' : 'var(--cream)') : 'var(--muted)',
                    cursor: connected ? 'pointer' : 'not-allowed',
                    opacity: connected ? 1 : 0.45,
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
          </div>
          {connectedPlatforms.length === 0 && (
            <div className="dist-no-platforms">
              Connect at least one platform above to schedule a post.
            </div>
          )}
        </div>

        {/* Scheduled time */}
        <div>
          <label htmlFor="dist-scheduled-at" className="dist-field-label">Scheduled At</label>
          <input
            id="dist-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="dist-input dist-input--dark-scheme"
          />
        </div>

        <button type="submit" disabled={submitting || connectedPlatforms.length === 0} className="dist-btn dist-btn--primary">
          {submitting ? 'Scheduling…' : 'Schedule Post'}
        </button>
      </form>
    </div>
  )
}

SchedulePostForm.propTypes = {
  accounts:     PropTypes.array.isRequired,
  videoOptions: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, url: PropTypes.string })),
  onMsg:        PropTypes.func.isRequired,
  onPosted:     PropTypes.func.isRequired,
}

// ── Scheduled posts list ───────────────────────────────────────────────────
function ScheduledPostsList({ posts, onMsg, onRefresh }) {
  const [cancelling, setCancelling] = useState(null)

  async function handleCancel(id) {
    setCancelling(id)
    try {
      await socialApi.cancelPost(id)
      onMsg('Post cancelled.')
      onRefresh()
    } catch (err) {
      if (err.status === 409) {
        onMsg('Cannot cancel — post is already processing or completed.')
      } else {
        onMsg(err.message)
      }
    } finally {
      setCancelling(null)
    }
  }

  if (posts.length === 0) {
    return (
      <div className="dist-posts-section">
        <div className="dist-section-head">Scheduled Posts</div>
        <div className="dist-no-posts">No posts scheduled yet.</div>
      </div>
    )
  }

  return (
    <div className="dist-posts-section">
      <div className="dist-section-head">Scheduled Posts</div>
      <div className="dist-posts-list">
        {posts.map(post => (
          <div key={post.id} className="dist-post-card">
            {/* Header row */}
            <div className="dist-post-card__header">
              <div className="dist-post-card__meta">
                <div className="dist-post-card__title">{post.title}</div>
                <div className="dist-post-card__date">
                  {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : '—'}
                </div>
              </div>
              <div className="dist-post-card__actions">
                <span style={statusStyle(post.status)}>{post.status}</span>
                {post.status === 'scheduled' && (
                  <button
                    onClick={() => handleCancel(post.id)}
                    disabled={cancelling === post.id}
                    className="dist-btn dist-btn--danger"
                  >{cancelling === post.id ? '…' : 'Cancel'}</button>
                )}
              </div>
            </div>

            {/* Per-target rows */}
            {(post.targets ?? []).length > 0 && (
              <div className="dist-post-card__targets">
                {post.targets.map((t, i) => {
                  const meta = PLATFORM_META[t.platform] ?? { label: t.platform, icon: '📡' }
                  return (
                    <div key={i} className="dist-target-row">
                      <span className="dist-target-icon">{meta.icon}</span>
                      <span className="dist-target-name">{meta.label}</span>
                      <span style={statusStyle(t.status)}>{t.status}</span>
                      {t.postUrl && (
                        <a href={t.postUrl} target="_blank" rel="noopener noreferrer"
                          className="dist-target-link">
                          View
                        </a>
                      )}
                      {t.error && (
                        <span role="alert" className="dist-target-error">
                          {t.error}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

ScheduledPostsList.propTypes = {
  posts:     PropTypes.array.isRequired,
  onMsg:     PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
}

// ── Social plan-gate wall ──────────────────────────────────────────────────
function SocialPlanGate({ onOpenBilling }) {
  const req = minPlanFor('social')
  const reqLabel = planLabel(req)
  return (
    <div className="dist-plan-gate">
      <span aria-hidden="true" className="dist-plan-gate__icon">🔒</span>
      <div className="dist-plan-gate__title">Social Distribution</div>
      <div className="dist-plan-gate__body">
        Schedule and publish posts to YouTube, TikTok, Instagram, and more.
        Requires the <span className="dist-plan-gate__plan-name">{reqLabel}</span> plan or higher.
      </div>
      {onOpenBilling && (
        <button
          onClick={onOpenBilling}
          aria-label={`Upgrade to ${reqLabel} to unlock Social Distribution`}
          className="dist-plan-gate__upgrade"
        >
          Upgrade to {reqLabel}
        </button>
      )}
    </div>
  )
}

SocialPlanGate.propTypes = {
  onOpenBilling: PropTypes.func,
}

// ── DistributionPanel ──────────────────────────────────────────────────────
export default function DistributionPanel({ videoOptions = [], onMsg, onOpenBilling }) {
  const { activeWorkspacePlan } = useAuth()
  const [providers, setProviders] = useState([])
  const [accounts,  setAccounts]  = useState([])
  const [posts,     setPosts]     = useState([])
  const [loading,   setLoading]   = useState(true)

  // Plan gate: social requires pro+
  const hasSocialAccess = planAllows(activeWorkspacePlan, 'social')

  const loadAll = useCallback(async () => {
    if (!hasSocialAccess) { setLoading(false); return }
    try {
      const [provs, accs, psts] = await Promise.all([
        socialApi.providers(),
        socialApi.accounts(),
        socialApi.posts(),
      ])
      setProviders(provs ?? [])
      setAccounts(accs ?? [])
      setPosts(psts ?? [])
    } catch (err) {
      // 403 plan_feature: show the gate instead
      if (err.code === 'plan_feature' || err.status === 403) {
        // plan gate enforced server-side; just show the upgrade wall
        setLoading(false)
        return
      }
      onMsg(err.message)
    } finally {
      setLoading(false)
    }
  }, [onMsg, hasSocialAccess])

  useEffect(() => { loadAll() }, [loadAll])

  // Show plan gate if plan lacks social, regardless of loading state
  if (!hasSocialAccess) {
    return <SocialPlanGate onOpenBilling={onOpenBilling} />
  }

  if (loading) {
    return <div className="dist-loading">Loading distribution data…</div>
  }

  return (
    <div>
      <ConnectAccounts
        providers={providers}
        accounts={accounts}
        onMsg={onMsg}
        onRefresh={loadAll}
      />
      <div className="dist-separator">
        <SchedulePostForm
          accounts={accounts}
          videoOptions={videoOptions}
          onMsg={onMsg}
          onPosted={loadAll}
        />
      </div>
      <div className="dist-separator--last">
        <ScheduledPostsList
          posts={posts}
          onMsg={onMsg}
          onRefresh={loadAll}
        />
      </div>
    </div>
  )
}

DistributionPanel.propTypes = {
  videoOptions:  PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, url: PropTypes.string })),
  onMsg:         PropTypes.func.isRequired,
  onOpenBilling: PropTypes.func,
}
