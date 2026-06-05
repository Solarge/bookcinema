import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { admin as adminApi } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import '../../styles/admin.css'

// ── Shared message banner ───────────────────────────────────────────────────
function MsgBanner({ msg, kind, onClear }) {
  if (!msg) return null
  const isErr = kind === 'error'
  return (
    <div
      role={isErr ? 'alert' : 'status'}
      aria-live="polite"
      className={`adm-msg ${isErr ? 'adm-msg--error' : 'adm-msg--success'}`}
    >
      <span>{msg}</span>
      <button
        onClick={onClear}
        aria-label="Dismiss message"
        className="adm-msg__close"
      >×</button>
    </div>
  )
}
MsgBanner.propTypes = { msg: PropTypes.string, kind: PropTypes.string, onClear: PropTypes.func.isRequired }

// ── Section: Overview ───────────────────────────────────────────────────────
function OverviewSection({ onMsg }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.stats()
      setStats(data)
    } catch (err) {
      onMsg(`Stats error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [onMsg])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="adm-empty">Loading stats…</div>
  if (!stats) return null

  const jobs = stats.jobs || {}
  const byStatus = jobs.byStatus || {}

  const mainCards = [
    ['Users',          stats.users      ?? 0,                        '#6dc87a'],
    ['Workspaces',     stats.workspaces ?? 0,                        'var(--gold)'],
    ['Series',         stats.series     ?? 0,                        'var(--cream)'],
    ['Platform Spend', `$${(stats.totalCostUsd ?? 0).toFixed(3)}`,   '#f0a050'],
  ]

  return (
    <div>
      <div className="adm-cards-grid">
        {mainCards.map(([label, value, color]) => (
          <div key={label} className="adm-stat-card">
            <div className="adm-stat-card__value" style={{ color }}>{value}</div>
            <div className="adm-stat-card__label">{label}</div>
          </div>
        ))}
      </div>

      {/* Jobs summary */}
      <div className="adm-jobs-summary">
        <div className="adm-jobs-summary__label">Jobs — Total: {jobs.total ?? 0}</div>
        <div className="adm-jobs-chips">
          {[
            ['Queued',  byStatus.queued  ?? 0, 'var(--muted)'],
            ['Active',  byStatus.active  ?? 0, '#f0c040'],
            ['Done',    byStatus.done    ?? 0, '#6dc87a'],
            ['Failed',  byStatus.failed  ?? 0, '#f08080'],
          ].map(([label, count, color]) => (
            <div key={label} className="adm-jobs-chip">
              <div className="adm-jobs-chip__value" style={{ color }}>{count}</div>
              <div className="adm-jobs-chip__label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-refresh-row">
        <button onClick={load} disabled={loading} className={`adm-btn adm-btn--ghost${loading ? ' adm-btn--disabled' : ''}`} aria-label="Refresh overview stats">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
OverviewSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: Funnel ─────────────────────────────────────────────────────────
const FUNNEL_COLORS = ['var(--cream)', '#a0c8f0', '#6dc87a', 'var(--gold)']

function FunnelBar({ count, max, color }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 4
  return (
    <div className="adm-funnel-bar-wrap" aria-hidden="true">
      <div className="adm-funnel-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
FunnelBar.propTypes = { count: PropTypes.number.isRequired, max: PropTypes.number.isRequired, color: PropTypes.string.isRequired }

function FunnelSection({ onMsg }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [days,    setDays]    = useState(30)

  const load = useCallback(async (d) => {
    setLoading(true)
    try {
      const res = await adminApi.funnel(d)
      setData(res)
    } catch (err) {
      onMsg(`Funnel error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [onMsg])

  useEffect(() => { load(days) }, [load, days])

  const funnel = data?.funnel ?? []
  const max = funnel[0]?.count ?? 0

  const STAGE_LABELS = {
    signup:        'Signup',
    email_verified: 'Email Verified',
    activated:     'Activated (1st Gen)',
    upgraded:      'Paid Upgrade',
  }

  return (
    <div>
      {/* Window selector */}
      <div className="adm-funnel-filters">
        <span className="adm-funnel-window-label">Window:</span>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`adm-btn ${days === d ? 'adm-btn--primary' : 'adm-btn--ghost'}`}
            disabled={loading}
            aria-pressed={days === d}
          >{d}d</button>
        ))}
        <button onClick={() => load(days)} disabled={loading} className="adm-btn adm-btn--ghost" aria-label="Refresh funnel">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {loading && !data && <div className="adm-empty">Loading funnel…</div>}

      {funnel.length > 0 && (
        <div role="list" aria-label="Conversion funnel stages" className="adm-funnel-list">
          {funnel.map((stage, i) => (
            <div key={stage.stage} role="listitem" className="adm-funnel-row">
              {/* Stage label */}
              <div className="adm-funnel-stage-label" style={{ color: FUNNEL_COLORS[i] }}>
                {STAGE_LABELS[stage.stage] ?? stage.stage}
              </div>
              {/* Bar */}
              <FunnelBar count={stage.count} max={max} color={FUNNEL_COLORS[i]} />
              {/* Count */}
              <div
                className="adm-funnel-count"
                style={{ color: FUNNEL_COLORS[i] }}
                aria-label={`${stage.count} users`}
              >{stage.count}</div>
              {/* Rate */}
              <div className="adm-funnel-rate">
                {stage.rate != null
                  ? <span style={{ color: stage.rate >= 50 ? '#6dc87a' : stage.rate >= 20 ? '#f0c040' : '#f08080' }}>{stage.rate}%</span>
                  : <span className="adm-funnel-rate--muted">—</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="adm-funnel-footnote">
          Rates: verified/signups → activated/verified → upgraded/activated · last {days} days
        </div>
      )}
    </div>
  )
}
FunnelSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: Users ──────────────────────────────────────────────────────────
function UserRow({ user, onMsg, onRefresh }) {
  const [credits, setCredits] = useState('')
  const [plan,    setPlan]    = useState(user.plan  || 'free')
  const [role,    setRole]    = useState(user.role  || 'user')
  const [busy,    setBusy]    = useState(false)

  async function handleSetCredits() {
    const amount = Number(credits)
    if (!Number.isFinite(amount)) return onMsg('Credits must be a number', 'error')
    setBusy(true)
    try {
      const r = await adminApi.setCredits(user._id, amount, amount >= 0 ? 'add' : 'set')
      onMsg(`Credits updated — new balance: ${r.balance}`, 'success')
      setCredits('')
      onRefresh?.()
    } catch (err) { onMsg(`Credits error (${user.email}): ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  async function handleSetPlan() {
    setBusy(true)
    try {
      const r = await adminApi.setPlan(user._id, { plan, role })
      onMsg(`Plan/role updated → ${r.workspacePlan ?? plan} / ${r.role ?? role}`, 'success')
      onRefresh?.()
    } catch (err) { onMsg(`Plan error (${user.email}): ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate ${user.email}? This will prevent them from logging in.`)) return
    setBusy(true)
    try {
      const r = await adminApi.deactivate(user._id)
      onMsg(r.message || `User ${user.email} deactivated`, 'success')
      onRefresh?.()
    } catch (err) { onMsg(`Deactivate error (${user.email}): ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  const inactive = user.isActive === false

  return (
    <tr className="adm-tr-border" style={{ opacity: inactive ? 0.6 : 1 }}>
      <td className="adm-td">
        <div className={`adm-user-name ${inactive ? 'adm-user-name--inactive' : 'adm-user-name--active'}`}>{user.name || '(no name)'}</div>
        <div className="adm-user-email">{user.email}</div>
      </td>
      <td className="adm-td">
        <span className={`adm-user-role ${user.role === 'admin' ? 'adm-user-role--admin' : 'adm-user-role--user'}`}>{user.role}</span>
      </td>
      <td className="adm-td">
        <span className="adm-user-plan">{user.plan || 'free'}</span>
        {inactive && <span className="adm-user-inactive-badge">INACTIVE</span>}
      </td>
      <td className="adm-td adm-td--actions">
        <div className="adm-row-actions">
          <input
            type="number"
            placeholder="Credits"
            value={credits}
            onChange={e => setCredits(e.target.value)}
            aria-label={`Grant credits to ${user.email}`}
            className="adm-input adm-input--sm"
            style={{ width: '72px' }}
          />
          <button onClick={handleSetCredits} disabled={busy || credits === ''} className="adm-btn adm-btn--primary" aria-label={`Apply credit change to ${user.email}`}>Grant</button>

          <select
            value={plan}
            onChange={e => setPlan(e.target.value)}
            aria-label={`Set plan for ${user.email}`}
            className="adm-input adm-input--select adm-input--sm"
          >
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="studio">studio</option>
          </select>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            aria-label={`Set role for ${user.email}`}
            className="adm-input adm-input--select adm-input--sm"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={handleSetPlan} disabled={busy} className="adm-btn adm-btn--ghost" aria-label={`Apply plan/role to ${user.email}`}>Apply</button>

          {user.isActive !== false && (
            <button onClick={handleDeactivate} disabled={busy} className="adm-btn adm-btn--danger" aria-label={`Deactivate ${user.email}`}>Deactivate</button>
          )}
        </div>
      </td>
    </tr>
  )
}
UserRow.propTypes = { user: PropTypes.object.isRequired, onMsg: PropTypes.func.isRequired, onRefresh: PropTypes.func }

function UsersSection({ onMsg }) {
  const [query,   setQuery]   = useState('')
  const [users,   setUsers]   = useState(null)
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    setLoading(true)
    try {
      const params = q ? { search: q } : {}
      const data = await adminApi.users(params)
      setUsers(data.users ?? data)
      setTotal(data.total ?? (data.users ?? data).length)
    } catch (err) { onMsg(`User search error: ${err.message}`, 'error') }
    finally { setLoading(false) }
  }, [onMsg])

  useEffect(() => { search('') }, [search])

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 400)
  }

  return (
    <div>
      <div className="adm-search-row">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search users by name or email"
          className="adm-input adm-input--flex"
        />
        <button onClick={() => search(query)} disabled={loading} className="adm-btn adm-btn--ghost" aria-label="Run user search">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {users !== null && (
        <div className="adm-result-count">
          {total} user{total !== 1 ? 's' : ''}{total > (users?.length ?? 0) ? ` (showing ${users.length})` : ''}
        </div>
      )}

      {loading && users === null && <div className="adm-empty">Loading…</div>}
      {users !== null && users.length === 0 && <div className="adm-empty">No users found.</div>}

      {users !== null && users.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table" aria-label="User management table">
            <thead>
              <tr>
                {['User', 'Role', 'Plan / Status', 'Actions'].map(h => (
                  <th key={h} scope="col" className="adm-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow key={u._id} user={u} onMsg={onMsg} onRefresh={() => search(query)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
UsersSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: Workspaces ─────────────────────────────────────────────────────
function WorkspaceRow({ ws, onMsg, onRefresh }) {
  const [credits,     setCredits]     = useState('')
  const [creditsNote, setCreditsNote] = useState('')
  const [busy,        setBusy]        = useState(false)
  const [expanded,    setExpanded]    = useState(false)

  async function handleCredits() {
    const amount = Number(credits)
    if (!Number.isFinite(amount) || amount === 0) return onMsg('Amount must be a non-zero number', 'error')
    setBusy(true)
    try {
      const r = await adminApi.grantWorkspaceCredits(ws._id, amount, creditsNote || undefined)
      onMsg(`Credits updated — new balance: ${r.balance} (workspace ${ws.name})`, 'success')
      setCredits(''); setCreditsNote('')
      onRefresh?.()
    } catch (err) { onMsg(`Credits error (${ws.name}): ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  async function handleManaged(enabled) {
    setBusy(true)
    try {
      const r = await adminApi.setManagedAccess(ws._id, enabled)
      onMsg(`Managed generation ${r.managedBeta ? 'ENABLED' : 'DISABLED'} for ${ws.name}`, 'success')
      onRefresh?.()
    } catch (err) { onMsg(`Managed access error (${ws.name}): ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  return (
    <>
      <tr className="adm-tr-border">
        <td className="adm-td">
          <div className="adm-ws-name">{ws.name}</div>
          <div className="adm-ws-slug">{ws.slug}</div>
        </td>
        <td className="adm-td">
          <span className="adm-ws-type">{ws.type}</span>
        </td>
        <td className="adm-td">
          <span className="adm-ws-plan">{ws.plan || 'free'}</span>
        </td>
        <td className="adm-td adm-th--right">
          <span className="adm-ws-credit-bal">{ws.creditBalance ?? 0}</span>
          <span className="adm-ws-credit-unit">cr</span>
        </td>
        <td className="adm-td adm-th--right">
          <span className="adm-ws-member-count">{ws.memberCount ?? '—'}</span>
        </td>
        <td className="adm-td">
          <span className={ws.managedBeta ? 'adm-ws-managed-yes' : 'adm-ws-managed-no'}>
            {ws.managedBeta ? 'Yes' : 'No'}
          </span>
        </td>
        <td className="adm-td adm-td--nowrap">
          <button
            onClick={() => setExpanded(x => !x)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} actions for ${ws.name}`}
            className="adm-btn adm-btn--ghost"
          >{expanded ? '▲ Less' : '▼ Actions'}</button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="adm-ws-expanded">
            <div className="adm-ws-expanded-inner">

              {/* Credit adjustment */}
              <div>
                <div className="adm-ws-subsection-label">Grant / Deduct Credits</div>
                <div className="adm-ws-action-row">
                  <input
                    type="number"
                    placeholder="Amount (neg = deduct)"
                    value={credits}
                    onChange={e => setCredits(e.target.value)}
                    aria-label={`Credit amount for ${ws.name}`}
                    className="adm-input adm-input--sm-wide"
                  />
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={creditsNote}
                    onChange={e => setCreditsNote(e.target.value)}
                    aria-label={`Credit note for ${ws.name}`}
                    className="adm-input adm-input--sm-note"
                  />
                  <button onClick={handleCredits} disabled={busy || credits === ''} className="adm-btn adm-btn--primary" aria-label={`Apply credit change to ${ws.name}`}>Apply</button>
                </div>
              </div>

              {/* Managed beta toggle */}
              <div>
                <div className="adm-ws-subsection-label">Managed Generation</div>
                <div className="adm-managed-toggle-row">
                  <button onClick={() => handleManaged(true)}  disabled={busy} className="adm-btn adm-btn--primary" aria-label={`Enable managed generation for ${ws.name}`}>Enable</button>
                  <button onClick={() => handleManaged(false)} disabled={busy} className="adm-btn adm-btn--danger"  aria-label={`Disable managed generation for ${ws.name}`}>Disable</button>
                </div>
              </div>

              {/* Info */}
              <div className="adm-ws-info">
                <div>Owner ID: {ws.ownerId || '—'}</div>
                {ws.stripeSubscriptionId && <div>Stripe: {ws.stripeSubscriptionId}</div>}
                {ws.createdAt && <div>Created: {new Date(ws.createdAt).toLocaleDateString()}</div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
WorkspaceRow.propTypes = { ws: PropTypes.object.isRequired, onMsg: PropTypes.func.isRequired, onRefresh: PropTypes.func }

function WorkspacesSection({ onMsg }) {
  const [query,      setQuery]      = useState('')
  const [wsItems,    setWsItems]    = useState(null)
  const [loading,    setLoading]    = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    setLoading(true)
    try {
      const data = await adminApi.workspaces(q || undefined)
      setWsItems(Array.isArray(data) ? data : (data.workspaces ?? []))
    } catch (err) { onMsg(`Workspace search error: ${err.message}`, 'error') }
    finally { setLoading(false) }
  }, [onMsg])

  useEffect(() => { search('') }, [search])

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 400)
  }

  return (
    <div>
      <div className="adm-search-row">
        <input
          type="text"
          placeholder="Search workspaces…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search workspaces by name or slug"
          className="adm-input adm-input--flex"
        />
        <button onClick={() => search(query)} disabled={loading} className="adm-btn adm-btn--ghost" aria-label="Search workspaces">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {wsItems !== null && (
        <div className="adm-result-count">
          {wsItems.length} workspace{wsItems.length !== 1 ? 's' : ''}
        </div>
      )}

      {loading && wsItems === null && <div className="adm-empty">Loading…</div>}
      {wsItems !== null && wsItems.length === 0 && <div className="adm-empty">No workspaces found.</div>}

      {wsItems !== null && wsItems.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table" aria-label="Workspace management table">
            <thead>
              <tr>
                {['Name / Slug', 'Type', 'Plan', 'Credits', 'Members', 'Managed?', 'Actions'].map(h => (
                  <th key={h} scope="col" className={`adm-th${h === 'Credits' || h === 'Members' ? ' adm-th--right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wsItems.map(ws => (
                <WorkspaceRow key={ws._id} ws={ws} onMsg={onMsg} onRefresh={() => search(query)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
WorkspacesSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: Jobs ───────────────────────────────────────────────────────────
const JOB_STATUS_COLOR = {
  queued:  'var(--muted)',
  active:  '#f0c040',
  done:    '#6dc87a',
  failed:  '#f08080',
}

function JobsSection({ onMsg }) {
  const [jobs,     setJobs]     = useState(null)
  const [summary,  setSummary]  = useState(null)
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [statusF,  setStatusF]  = useState('')
  const [typeF,    setTypeF]    = useState('')
  const [limitF,   setLimitF]   = useState('50')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusF) params.status = statusF
      if (typeF)   params.type   = typeF
      if (limitF)  params.limit  = limitF
      const data = await adminApi.jobs(params)
      setJobs(data.jobs ?? [])
      setSummary(data.summary ?? null)
      setTotal(data.total ?? 0)
    } catch (err) { onMsg(`Jobs error: ${err.message}`, 'error') }
    finally { setLoading(false) }
  }, [onMsg, statusF, typeF, limitF])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* Filters */}
      <div className="adm-jobs-filters">
        <select
          value={statusF}
          onChange={e => setStatusF(e.target.value)}
          aria-label="Filter by job status"
          className="adm-input adm-input--select adm-input--filter"
        >
          <option value="">All statuses</option>
          <option value="queued">queued</option>
          <option value="active">active</option>
          <option value="done">done</option>
          <option value="failed">failed</option>
        </select>

        <select
          value={typeF}
          onChange={e => setTypeF(e.target.value)}
          aria-label="Filter by job type"
          className="adm-input adm-input--select adm-input--filter"
        >
          <option value="">All types</option>
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="voice">voice</option>
          <option value="video">video</option>
          <option value="compile">compile</option>
        </select>

        <select
          value={limitF}
          onChange={e => setLimitF(e.target.value)}
          aria-label="Limit number of results"
          className="adm-input adm-input--select adm-input--filter"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>

        <button onClick={load} disabled={loading} className="adm-btn adm-btn--ghost" aria-label="Refresh jobs list">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary badges */}
      {summary && (
        <div className="adm-jobs-badges">
          {[['Queued', summary.queued, 'var(--muted)'], ['Active', summary.active, '#f0c040'], ['Done', summary.done, '#6dc87a'], ['Failed', summary.failed, '#f08080']].map(([label, count, color]) => (
            <div key={label} className="adm-jobs-badge">
              <span className="adm-jobs-badge__count" style={{ color }}>{count ?? 0}</span>
              <span className="adm-jobs-badge__label">{label}</span>
            </div>
          ))}
          <div className="adm-jobs-total">
            Total: {total}
          </div>
        </div>
      )}

      {loading && jobs === null && <div className="adm-empty">Loading jobs…</div>}
      {jobs !== null && jobs.length === 0 && <div className="adm-empty">No jobs found with current filters.</div>}

      {jobs !== null && jobs.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table" aria-label="Admin jobs table">
            <thead>
              <tr>
                {['Type', 'Tier', 'Status', 'Cost', 'Workspace', 'Created', 'Error'].map(h => (
                  <th key={h} scope="col" className={`adm-th${h === 'Cost' ? ' adm-th--right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const statusColor = JOB_STATUS_COLOR[job.status] ?? 'var(--muted)'
                return (
                  <tr key={job._id} className="adm-tr-row">
                    <td className="adm-td">{job.type}</td>
                    <td className="adm-td adm-job-tier">{job.tier || '—'}</td>
                    <td className="adm-td adm-td--nowrap" style={{ color: statusColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{job.status}</td>
                    <td className="adm-td adm-th--right adm-job-cost">{job.costUsd != null ? `$${job.costUsd.toFixed(4)}` : '—'}</td>
                    <td className="adm-td adm-job-ws" title={job.workspaceId}>{job.workspaceId ? String(job.workspaceId).slice(-8) : '—'}</td>
                    <td className="adm-td adm-job-time">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="adm-td adm-job-error" title={job.errorMessage}>
                      {job.errorMessage || ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
JobsSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: System Config ──────────────────────────────────────────────────
function StatusDot({ ok }) {
  return (
    <span
      aria-hidden="true"
      className={`adm-status-dot ${ok ? 'adm-status-dot--ok' : 'adm-status-dot--off'}`}
    />
  )
}
StatusDot.propTypes = { ok: PropTypes.bool }

function ConfigRow({ label, ok }) {
  return (
    <div className="adm-config-row">
      <StatusDot ok={ok} />
      <span className={`adm-config-row__label ${ok ? 'adm-user-name--active' : 'adm-user-name--inactive'}`}>{label}</span>
      <span className={`adm-config-row__status ${ok ? 'adm-config-row__status--ok' : 'adm-config-row__status--off'}`}>
        {ok ? 'Configured' : 'Not set'}
      </span>
    </div>
  )
}
ConfigRow.propTypes = { label: PropTypes.string.isRequired, ok: PropTypes.bool }

function SystemSection({ onMsg }) {
  const [cfg,     setCfg]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.config()
      setCfg(data)
    } catch (err) { onMsg(`Config error: ${err.message}`, 'error') }
    finally { setLoading(false) }
  }, [onMsg])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="adm-empty">Loading config…</div>
  if (!cfg) return null

  const managed   = cfg.managed   || {}
  const stripe    = cfg.stripe    || {}
  const plans     = cfg.plans     || {}
  const providers = cfg.providers || []
  const social    = cfg.social    || []

  return (
    <div>
      <div className="adm-config-warn">
        Read-only status view — set API keys and configuration in .env.server
      </div>

      <div className="adm-config-grid">

        {/* AI Providers */}
        <div className="adm-config-panel">
          <div className="adm-config-panel__label">AI Providers</div>
          {providers.length === 0 && <div className="adm-empty">None listed.</div>}
          {providers.map(p => (
            <ConfigRow key={p.provider} label={p.provider} ok={p.configured} />
          ))}
        </div>

        {/* Social */}
        {social.length > 0 && (
          <div className="adm-config-panel">
            <div className="adm-config-panel__label">Social Providers</div>
            {social.map(s => (
              <ConfigRow key={s.key} label={s.label || s.key} ok={s.configured} />
            ))}
          </div>
        )}

        {/* Infrastructure */}
        <div className="adm-config-panel">
          <div className="adm-config-panel__label">Infrastructure</div>
          <ConfigRow label="Stripe" ok={stripe.configured} />
          <ConfigRow label="Redis" ok={cfg.redis?.configured} />
          {stripe.configured && (
            <div className="adm-mt-10">
              <div className="adm-stripe-sub-label">Stripe Prices</div>
              {Object.entries(stripe.pricesConfigured || {}).map(([key, ok]) => (
                <ConfigRow key={key} label={key} ok={ok} />
              ))}
            </div>
          )}
        </div>

        {/* Managed Generation */}
        <div className="adm-config-panel">
          <div className="adm-config-panel__label">Managed Generation</div>
          <div className="adm-managed-status-row">
            <StatusDot ok={managed.enabled} />
            <span className={managed.enabled ? 'adm-managed-enabled' : 'adm-managed-disabled'}>{managed.enabled ? 'Enabled' : 'Disabled (kill-switch)'}</span>
          </div>
          <div className="adm-managed-detail">
            <div className="adm-managed-detail-item">Max Concurrent: <span className="adm-managed-detail-value">{managed.maxConcurrent ?? '—'}</span></div>
            <div className="adm-managed-detail-item">Starter Credits: <span className="adm-managed-detail-value">{managed.starterCredits ?? '—'}</span></div>
          </div>
          {managed.caps && (
            <div className="adm-mt-10">
              <div className="adm-caps-label">Credit Caps</div>
              {Object.entries(managed.caps).map(([type, cap]) => (
                <div key={type} className="adm-cap-row">
                  <span className="adm-cap-key">{type}</span>
                  <span className="adm-cap-val">{cap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan matrix */}
      {Object.keys(plans).length > 0 && (
        <div className="adm-plan-matrix">
          <div className="adm-config-panel__label">Plan Matrix</div>
          <div className="adm-table-wrap">
            <table className="adm-table" aria-label="Plan configuration matrix">
              <thead>
                <tr>
                  <th scope="col" className="adm-th">Plan</th>
                  <th scope="col" className="adm-th adm-th--right">Credits</th>
                  <th scope="col" className="adm-th">Features</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(plans).map(([planKey, planData]) => (
                  <tr key={planKey} className="adm-tr-row">
                    <td className="adm-td adm-plan-name">{planKey}</td>
                    <td className="adm-td adm-th--right">{planData.credits ?? '—'}</td>
                    <td className="adm-td adm-plan-feats">
                      {Array.isArray(planData.features)
                        ? planData.features.join(' · ')
                        : typeof planData.features === 'object'
                          ? Object.entries(planData.features || {}).filter(([, v]) => v).map(([k]) => k).join(' · ')
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="adm-refresh-row">
        <button onClick={load} disabled={loading} className="adm-btn adm-btn--ghost" aria-label="Refresh system config">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
SystemSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Section: Security (TOTP 2FA management) ─────────────────────────────────
function SecuritySection({ onMsg }) {
  const { user, updateUser } = useAuth()
  const [step,      setStep]      = useState('idle')  // 'idle' | 'setup' | 'enable' | 'disable'
  const [secret,    setSecret]    = useState('')
  const [otpUrl,    setOtpUrl]    = useState('')
  const [code,      setCode]      = useState('')
  const [busy,      setBusy]      = useState(false)

  const totpEnabled = user?.totpEnabled ?? false

  async function handleSetup() {
    setBusy(true)
    try {
      const res = await adminApi.setup2fa()
      setSecret(res.secret)
      setOtpUrl(res.otpauthUrl)
      setStep('enable')
      setCode('')
    } catch (err) { onMsg(`Setup error: ${err.message}`, 'error') }
    finally { setBusy(false) }
  }

  async function handleEnable() {
    if (!code) return onMsg('Enter the 6-digit code from your authenticator app', 'error')
    setBusy(true)
    try {
      await adminApi.enable2fa(code)
      updateUser({ totpEnabled: true })
      setStep('idle')
      setCode(''); setSecret(''); setOtpUrl('')
      onMsg('Two-factor authentication enabled.', 'success')
    } catch (err) { onMsg(err.message || 'Invalid code', 'error'); setCode('') }
    finally { setBusy(false) }
  }

  async function handleDisable() {
    if (!code) return onMsg('Enter the 6-digit code to confirm disable', 'error')
    setBusy(true)
    try {
      await adminApi.disable2fa(code)
      updateUser({ totpEnabled: false })
      setStep('idle')
      setCode('')
      onMsg('Two-factor authentication disabled.', 'success')
    } catch (err) { onMsg(err.message || 'Invalid code', 'error'); setCode('') }
    finally { setBusy(false) }
  }

  const codeInput = (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="6-digit code"
      value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      aria-label="Authenticator code"
      className="adm-input adm-2fa-code-input"
    />
  )

  return (
    <div>
      {/* Status card */}
      <div className="adm-2fa-status-card">
        <div
          className={`adm-2fa-indicator ${totpEnabled ? 'adm-2fa-indicator--on' : 'adm-2fa-indicator--off'}`}
          aria-hidden="true"
        />
        <div>
          <div className={`adm-2fa-status-label ${totpEnabled ? 'adm-2fa-status-label--on' : 'adm-2fa-status-label--off'}`}>
            {totpEnabled ? '2FA Enabled' : '2FA Disabled'}
          </div>
          <div className="adm-2fa-status-body">
            {totpEnabled
              ? 'Your admin account is protected by TOTP two-factor authentication.'
              : 'Enable TOTP 2FA to require a time-based code at every sign-in.'}
          </div>
        </div>
      </div>

      {/* Setup / enable flow */}
      {!totpEnabled && step === 'idle' && (
        <button onClick={handleSetup} disabled={busy} className="adm-btn adm-btn--primary" aria-label="Begin 2FA setup">
          {busy ? 'Generating…' : 'Enable 2FA'}
        </button>
      )}

      {step === 'enable' && (
        <div className="adm-2fa-setup-panel">
          <div className="adm-2fa-setup-heading">Scan or enter the secret in your authenticator app</div>

          <div className="adm-2fa-mb-14">
            <div className="adm-2fa-field-hint">Secret (Base32 — for manual entry)</div>
            <div className="adm-2fa-secret-block" aria-label="TOTP secret key">{secret}</div>
          </div>

          <div className="adm-2fa-mb-18">
            <div className="adm-2fa-field-hint">OTPAuth URL (for QR generators)</div>
            <div className="adm-2fa-otpurl-block">
              <a href={otpUrl} aria-label="OTPAuth URL">{otpUrl}</a>
            </div>
          </div>

          <div className="adm-2fa-confirm-prompt">
            Enter the 6-digit code from your app to confirm:
          </div>
          <div className="adm-2fa-code-row">
            {codeInput}
            <button onClick={handleEnable} disabled={busy || code.length < 6} className="adm-btn adm-btn--primary" aria-label="Confirm and activate 2FA">
              {busy ? 'Verifying…' : 'Confirm & Activate'}
            </button>
            <button onClick={() => { setStep('idle'); setSecret(''); setOtpUrl(''); setCode('') }} className="adm-btn adm-btn--ghost" aria-label="Cancel 2FA setup">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Disable flow */}
      {totpEnabled && step === 'idle' && (
        <button onClick={() => { setStep('disable'); setCode('') }} className="adm-btn adm-btn--danger" aria-label="Begin 2FA disable">
          Disable 2FA
        </button>
      )}

      {step === 'disable' && (
        <div className="adm-2fa-disable-panel">
          <div className="adm-2fa-disable-heading">Confirm with your current authenticator code</div>
          <div className="adm-2fa-code-row">
            {codeInput}
            <button onClick={handleDisable} disabled={busy || code.length < 6} className="adm-btn adm-btn--danger" aria-label="Confirm disable 2FA">
              {busy ? 'Verifying…' : 'Disable 2FA'}
            </button>
            <button onClick={() => { setStep('idle'); setCode('') }} className="adm-btn adm-btn--ghost" aria-label="Cancel disable 2FA">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
SecuritySection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Sidebar nav ─────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'overview',   label: 'Overview'   },
  { key: 'funnel',     label: 'Funnel'     },
  { key: 'users',      label: 'Users'      },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'jobs',       label: 'Jobs'       },
  { key: 'system',     label: 'System'     },
  { key: 'security',   label: 'Security'   },
]

// ── AdminDashboard (full-page) ───────────────────────────────────────────────
export default function AdminDashboard({ onBack }) {
  const [section, setSection] = useState('overview')
  const [msg,     setMsg]     = useState('')
  const [msgKind, setMsgKind] = useState('success')

  function onMsg(text, kind = 'success') {
    setMsg(text)
    setMsgKind(kind)
    // Auto-clear success messages after 6s; errors stay until dismissed
    if (kind !== 'error') {
      setTimeout(() => setMsg(prev => prev === text ? '' : prev), 6000)
    }
  }

  const activeSection = SECTIONS.find(s => s.key === section)

  return (
    <div className="adm-dashboard">

      {/* Header */}
      <div className="adm-header">
        <button
          onClick={onBack}
          aria-label="Back to home"
          className="adm-header__back"
        >← Back</button>

        <div className="adm-header__title">
          Admin — Manage App
        </div>

        {/* Admin warning badge */}
        <div className="adm-header__badge" role="note" aria-label="Admin-only zone">
          Admin Zone
        </div>
      </div>

      <div className="adm-body">

        {/* Sidebar */}
        <nav aria-label="Admin dashboard sections" className="adm-nav">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => { setSection(s.key); setMsg('') }}
              aria-current={s.key === section ? 'page' : undefined}
              className={`adm-nav__item${s.key === section ? ' adm-nav__item--active' : ''}`}
            >{s.label}</button>
          ))}
        </nav>

        {/* Main content area */}
        <main
          aria-label={`${activeSection?.label ?? 'Admin'} section`}
          className="adm-main"
        >
          {/* Section heading */}
          <div className="adm-section-heading">
            <h1>{activeSection?.label}</h1>
          </div>

          {/* Message banner */}
          <MsgBanner msg={msg} kind={msgKind} onClear={() => setMsg('')} />

          {/* Section content */}
          {section === 'overview'   && <OverviewSection   onMsg={onMsg} />}
          {section === 'funnel'     && <FunnelSection     onMsg={onMsg} />}
          {section === 'users'      && <UsersSection      onMsg={onMsg} />}
          {section === 'workspaces' && <WorkspacesSection onMsg={onMsg} />}
          {section === 'jobs'       && <JobsSection       onMsg={onMsg} />}
          {section === 'system'     && <SystemSection     onMsg={onMsg} />}
          {section === 'security'   && <SecuritySection   onMsg={onMsg} />}
        </main>
      </div>
    </div>
  )
}

AdminDashboard.propTypes = {
  onBack: PropTypes.func.isRequired,
}
