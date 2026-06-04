import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { social as socialApi } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { planAllows, minPlanFor, planLabel } from '../../utils/plans'

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

const inputStyle = {
  display: 'block',
  width: '100%',
  background: '#0a0806',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  padding: '9px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '9px',
  color: 'var(--muted)',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '5px',
  display: 'block',
}

const sectionHeadStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '9px',
  color: 'var(--muted)',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '12px',
}

function btn(disabled, variant = 'primary') {
  if (variant === 'danger') return {
    background: 'transparent', color: '#f08080', border: '1px solid #804040',
    padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
  if (variant === 'secondary') return {
    background: 'var(--surface2)', color: 'var(--cream)', border: '1px solid var(--border)',
    padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
  return {
    background: disabled ? 'var(--border)' : 'var(--gold)',
    color: disabled ? 'var(--muted)' : '#080b10',
    border: 'none',
    padding: '10px 20px',
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
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
    <div style={{ marginBottom: '28px' }}>
      <div style={sectionHeadStyle}>Connected Accounts</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {providers.map(p => {
          const meta    = PLATFORM_META[p.key] ?? { label: p.label, icon: '📡' }
          const account = accounts.find(a => a.platform === p.key)
          const isBusy  = connecting === p.key || disconnecting === account?.id

          return (
            <div key={p.key} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
            }}>
              {/* Icon + label */}
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--cream)' }}>{meta.label}</div>
                {account && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6dc87a', marginTop: '2px' }}>
                    {account.displayName}
                  </div>
                )}
              </div>

              {/* Action button */}
              {!p.configured ? (
                <span
                  title="Add this platform's API credentials on the server to enable it."
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '9px',
                    color: 'var(--muted)', border: '1px solid var(--border)',
                    padding: '4px 10px', letterSpacing: '1px', textTransform: 'uppercase',
                    cursor: 'default', opacity: 0.6,
                  }}
                >Setup required</span>
              ) : account ? (
                <button
                  onClick={() => handleDisconnect(account.id, p.key)}
                  disabled={isBusy}
                  style={btn(isBusy, 'danger')}
                >{isBusy ? '…' : 'Disconnect'}</button>
              ) : (
                <button
                  onClick={() => handleConnect(p.key)}
                  disabled={isBusy}
                  style={btn(isBusy, 'secondary')}
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
    <div style={{ marginBottom: '28px' }}>
      <div style={sectionHeadStyle}>Schedule a Post</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Video URL */}
        <div>
          <label htmlFor="dist-video-url" style={labelStyle}>Video URL</label>
          {(videoOptions?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <button type="button" onClick={() => setUseDropdown(true)}
                style={{ ...btn(false, useDropdown ? 'secondary' : 'primary'), padding: '5px 10px', fontSize: '9px' }}>
                Pick Generated
              </button>
              <button type="button" onClick={() => setUseDropdown(false)}
                style={{ ...btn(false, !useDropdown ? 'secondary' : 'primary'), padding: '5px 10px', fontSize: '9px' }}>
                Paste URL
              </button>
            </div>
          )}
          {useDropdown && (videoOptions?.length ?? 0) > 0 ? (
            <select
              id="dist-video-url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
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
              style={inputStyle}
            />
          )}
          {videoUrl && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', marginTop: '3px', wordBreak: 'break-all' }}>
              {videoUrl}
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="dist-title" style={labelStyle}>Title</label>
          <input
            id="dist-title"
            type="text"
            placeholder="Post title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Caption */}
        <div>
          <label htmlFor="dist-caption" style={labelStyle}>Caption</label>
          <textarea
            id="dist-caption"
            placeholder="Caption / description…"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Target platforms */}
        <div>
          <label style={labelStyle}>Target Platforms</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    padding: '5px 10px',
                    border: `1px solid ${checked && connected ? 'var(--gold)' : 'var(--border)'}`,
                    background: checked && connected ? 'rgba(200,160,80,0.12)' : 'transparent',
                    color: connected ? (checked ? 'var(--gold)' : 'var(--cream)') : 'var(--muted)',
                    cursor: connected ? 'pointer' : 'not-allowed',
                    opacity: connected ? 1 : 0.45,
                    letterSpacing: '1px',
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
          </div>
          {connectedPlatforms.length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#f0a050', marginTop: '6px' }}>
              Connect at least one platform above to schedule a post.
            </div>
          )}
        </div>

        {/* Scheduled time */}
        <div>
          <label htmlFor="dist-scheduled-at" style={labelStyle}>Scheduled At</label>
          <input
            id="dist-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>

        <button type="submit" disabled={submitting || connectedPlatforms.length === 0} style={btn(submitting || connectedPlatforms.length === 0)}>
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
      <div>
        <div style={sectionHeadStyle}>Scheduled Posts</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>
          No posts scheduled yet.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={sectionHeadStyle}>Scheduled Posts</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {posts.map(post => (
          <div key={post.id} style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            padding: '12px 14px',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--cream)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {post.title}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)' }}>
                  {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <span style={statusStyle(post.status)}>{post.status}</span>
                {post.status === 'scheduled' && (
                  <button
                    onClick={() => handleCancel(post.id)}
                    disabled={cancelling === post.id}
                    style={btn(cancelling === post.id, 'danger')}
                  >{cancelling === post.id ? '…' : 'Cancel'}</button>
                )}
              </div>
            </div>

            {/* Per-target rows */}
            {(post.targets ?? []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                {post.targets.map((t, i) => {
                  const meta = PLATFORM_META[t.platform] ?? { label: t.platform, icon: '📡' }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', width: '16px', textAlign: 'center', flexShrink: 0 }}>{meta.icon}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', width: '70px', flexShrink: 0 }}>{meta.label}</span>
                      <span style={statusStyle(t.status)}>{t.status}</span>
                      {t.postUrl && (
                        <a href={t.postUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--gold)', textDecoration: 'underline', marginLeft: '4px' }}>
                          View
                        </a>
                      )}
                      {t.error && (
                        <span role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#f08080', marginLeft: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      padding: '28px 24px',
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    }}>
      <span aria-hidden="true" style={{ fontSize: '28px', opacity: 0.5 }}>🔒</span>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--cream)', letterSpacing: '2px' }}>
        Social Distribution
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6', maxWidth: '360px' }}>
        Schedule and publish posts to YouTube, TikTok, Instagram, and more.
        Requires the <span style={{ color: 'var(--gold)' }}>{reqLabel}</span> plan or higher.
      </div>
      {onOpenBilling && (
        <button
          onClick={onOpenBilling}
          aria-label={`Upgrade to ${reqLabel} to unlock Social Distribution`}
          style={{
            background: 'var(--gold)', color: '#080b10', border: 'none',
            fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: '700',
            letterSpacing: '2px', textTransform: 'uppercase',
            padding: '9px 20px', cursor: 'pointer', marginTop: '4px',
          }}
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
    return (
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '8px 0' }}>
        Loading distribution data…
      </div>
    )
  }

  return (
    <div>
      <ConnectAccounts
        providers={providers}
        accounts={accounts}
        onMsg={onMsg}
        onRefresh={loadAll}
      />
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', marginBottom: '24px' }}>
        <SchedulePostForm
          accounts={accounts}
          videoOptions={videoOptions}
          onMsg={onMsg}
          onPosted={loadAll}
        />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
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
