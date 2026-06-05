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

// ── Connect Accounts section ───────────────────────────────────────────────
function ConnectAccounts({ providers, accounts, onMsg, onRefresh }) {
  const [connecting, setConnecting] = useState(null)
  const [disconnecting, setDisconnecting] = useState(null)

  async function handleConnect(platform) {
    setConnecting(platform)
    try {
      const { url } = await socialApi.connect(platform)
      window.location.href = url
    } catch (err) {
      if (err.code === 'not_configured' || err.status === 503) {
        onMsg(`${PLATFORM_META[platform]?.label ?? platform} is not configured on the server. Add the platform's API credentials to enable it.`)
      } else {
        onMsg(err.message)
      }
      setConnecting(null)
    }
  }

  async function handleDisconnect(accountId, platform) {
    setDisconnecting(accountId)
    try {
      await socialApi.disconnect(accountId)
      onMsg(`${PLATFORM_META[platform]?.label ?? platform} disconnected.`)
      onRefresh()
    } catch (err) {
      onMsg(err.message)
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="dist-accounts">
      <div className="dist-section-head">Connected Accounts</div>
      <div className="dist-accounts-list">
        {providers.map(p => {
          const meta    = PLATFORM_META[p.key] ?? { label: p.label, icon: '📡' }
          const account = accounts.find(a => a.platform === p.key)
          const isBusy  = connecting === p.key || disconnecting === account?.id

          return (
            <div key={p.key} className="dist-account-row">
              {/* Icon + label */}
              <span className="dist-account-icon">{meta.icon}</span>
              <div className="dist-account-meta">
                <div className="dist-account-label">{meta.label}</div>
                {account && (
                  <div className="dist-account-connected">
                    {account.displayName}
                  </div>
                )}
              </div>

              {/* Action button */}
              {!p.configured ? (
                <span
                  title="Add this platform's API credentials on the server to enable it."
                  className="dist-account-setup"
                >Setup required</span>
              ) : account ? (
                <button
                  onClick={() => handleDisconnect(account.id, p.key)}
                  disabled={isBusy}
                  className="dist-btn dist-btn--danger"
                >{isBusy ? '…' : 'Disconnect'}</button>
              ) : (
                <button
                  onClick={() => handleConnect(p.key)}
                  disabled={isBusy}
                  className="dist-btn dist-btn--secondary"
                >{isBusy ? 'Connecting…' : 'Connect'}</button>
              )}
            </div>
          )
        })}
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
