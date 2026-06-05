import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { admin as adminApi } from '../../lib/api'

// ── Style helpers (matches AdminPanel + app aesthetic) ──────────────────────
const mono = (size = '11px', color = 'var(--cream)') => ({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: size,
  color,
})
const cinzel = (size = '13px', color = 'var(--gold)') => ({
  fontFamily: "'Cinzel', serif",
  fontSize: size,
  color,
  letterSpacing: '1.5px',
})
const sectionLabel = {
  ...mono('9px', 'var(--muted)'),
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '10px',
}
const cardStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  padding: '16px',
  textAlign: 'center',
}
const inputStyle = {
  background: '#0a0806',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  padding: '9px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
const btnStyle = (variant = 'primary', disabled = false) => {
  const base = {
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    padding: '8px 16px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
  if (disabled) return { ...base, background: 'var(--border)', color: 'var(--muted)' }
  if (variant === 'danger')  return { ...base, background: 'transparent', color: '#f08080', border: '1px solid #804040' }
  if (variant === 'ghost')   return { ...base, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }
  if (variant === 'warning') return { ...base, background: 'transparent', color: '#f0a050', border: '1px solid #805030' }
  if (variant === 'gold')    return { ...base, background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)' }
  return { ...base, background: 'var(--gold)', color: '#080b10' }
}
const thStyle = {
  ...mono('8px', 'var(--muted)'),
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 400,
  whiteSpace: 'nowrap',
}
const tdStyle = {
  ...mono('10px', 'var(--cream)'),
  padding: '8px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'top',
}

// ── Shared message banner ───────────────────────────────────────────────────
function MsgBanner({ msg, kind, onClear }) {
  if (!msg) return null
  const isErr = kind === 'error'
  return (
    <div
      role={isErr ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        background: isErr ? '#200a0a' : '#0a2010',
        border: `1px solid ${isErr ? '#7a3a3a' : '#3a7a4a'}`,
        padding: '10px 14px',
        ...mono('11px', isErr ? '#f08080' : '#6dc87a'),
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <span>{msg}</span>
      <button
        onClick={onClear}
        aria-label="Dismiss message"
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0, opacity: 0.7 }}
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

  if (loading) return <div style={mono('11px', 'var(--muted)')}>Loading stats…</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {mainCards.map(([label, value, color]) => (
          <div key={label} style={cardStyle}>
            <div style={{ ...cinzel('26px', color), lineHeight: 1, marginBottom: '6px' }}>{value}</div>
            <div style={sectionLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Jobs summary */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
        <div style={{ ...sectionLabel, marginBottom: '12px' }}>Jobs — Total: {jobs.total ?? 0}</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[
            ['Queued',  byStatus.queued  ?? 0, 'var(--muted)'],
            ['Active',  byStatus.active  ?? 0, '#f0c040'],
            ['Done',    byStatus.done    ?? 0, '#6dc87a'],
            ['Failed',  byStatus.failed  ?? 0, '#f08080'],
          ].map(([label, count, color]) => (
            <div key={label} style={{ background: '#0a0806', border: '1px solid var(--border)', padding: '10px 16px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ ...cinzel('20px', color), lineHeight: 1 }}>{count}</div>
              <div style={{ ...mono('8px', 'var(--muted)'), letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={load} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Refresh overview stats">
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
    <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', height: '8px', position: 'relative', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color, transition: 'width 0.4s ease' }} />
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        <span style={mono('10px', 'var(--muted)')}>Window:</span>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={btnStyle(days === d ? 'primary' : 'ghost', loading)}
            disabled={loading}
            aria-pressed={days === d}
          >{d}d</button>
        ))}
        <button onClick={() => load(days)} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Refresh funnel">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {loading && !data && <div style={mono('10px', 'var(--muted)')}>Loading funnel…</div>}

      {funnel.length > 0 && (
        <div role="list" aria-label="Conversion funnel stages" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {funnel.map((stage, i) => (
            <div key={stage.stage} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Stage label */}
              <div style={{ width: '148px', flexShrink: 0 }}>
                <div style={mono('11px', FUNNEL_COLORS[i])}>{STAGE_LABELS[stage.stage] ?? stage.stage}</div>
              </div>
              {/* Bar */}
              <FunnelBar count={stage.count} max={max} color={FUNNEL_COLORS[i]} />
              {/* Count */}
              <div style={{ ...cinzel('18px', FUNNEL_COLORS[i]), width: '58px', textAlign: 'right', lineHeight: 1 }}
                aria-label={`${stage.count} users`}>{stage.count}</div>
              {/* Rate */}
              <div style={{ width: '60px', textAlign: 'right', flexShrink: 0 }}>
                {stage.rate != null
                  ? <span style={mono('10px', stage.rate >= 50 ? '#6dc87a' : stage.rate >= 20 ? '#f0c040' : '#f08080')}>{stage.rate}%</span>
                  : <span style={mono('9px', 'var(--muted)')}>—</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div style={{ ...mono('8px', 'var(--muted)'), marginTop: '18px', letterSpacing: '1px' }}>
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
    <tr style={{ borderBottom: '1px solid var(--border)', opacity: inactive ? 0.6 : 1 }}>
      <td style={tdStyle}>
        <div style={mono('11px', inactive ? 'var(--muted)' : 'var(--cream)')}>{user.name || '(no name)'}</div>
        <div style={mono('9px', 'var(--muted)')}>{user.email}</div>
      </td>
      <td style={tdStyle}>
        <span style={{ ...mono('9px', user.role === 'admin' ? 'var(--gold)' : 'var(--muted)'), textTransform: 'uppercase', letterSpacing: '1px' }}>{user.role}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ ...mono('9px', '#6dc87a'), textTransform: 'uppercase', letterSpacing: '1px' }}>{user.plan || 'free'}</span>
        {inactive && <span style={{ ...mono('8px', '#f08080'), marginLeft: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>INACTIVE</span>}
      </td>
      <td style={{ ...tdStyle, minWidth: '260px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="Credits"
            value={credits}
            onChange={e => setCredits(e.target.value)}
            aria-label={`Grant credits to ${user.email}`}
            style={{ ...inputStyle, width: '72px', padding: '5px 8px' }}
          />
          <button onClick={handleSetCredits} disabled={busy || credits === ''} style={btnStyle('primary', busy || credits === '')} aria-label={`Apply credit change to ${user.email}`}>Grant</button>

          <select
            value={plan}
            onChange={e => setPlan(e.target.value)}
            aria-label={`Set plan for ${user.email}`}
            style={{ ...inputStyle, padding: '5px 8px', cursor: 'pointer' }}
          >
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="studio">studio</option>
          </select>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            aria-label={`Set role for ${user.email}`}
            style={{ ...inputStyle, padding: '5px 8px', cursor: 'pointer' }}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={handleSetPlan} disabled={busy} style={btnStyle('ghost', busy)} aria-label={`Apply plan/role to ${user.email}`}>Apply</button>

          {user.isActive !== false && (
            <button onClick={handleDeactivate} disabled={busy} style={btnStyle('danger', busy)} aria-label={`Deactivate ${user.email}`}>Deactivate</button>
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search users by name or email"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={() => search(query)} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Run user search">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {users !== null && (
        <div style={{ ...mono('9px', 'var(--muted)'), letterSpacing: '1px', marginBottom: '10px' }}>
          {total} user{total !== 1 ? 's' : ''}{total > (users?.length ?? 0) ? ` (showing ${users.length})` : ''}
        </div>
      )}

      {loading && users === null && <div style={mono('10px', 'var(--muted)')}>Loading…</div>}
      {users !== null && users.length === 0 && <div style={mono('10px', 'var(--muted)')}>No users found.</div>}

      {users !== null && users.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="User management table">
            <thead>
              <tr>
                {['User', 'Role', 'Plan / Status', 'Actions'].map(h => (
                  <th key={h} scope="col" style={{ ...thStyle, textAlign: 'left' }}>{h}</th>
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
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={tdStyle}>
          <div style={mono('11px', 'var(--cream)')}>{ws.name}</div>
          <div style={mono('8px', 'var(--muted)')}>{ws.slug}</div>
        </td>
        <td style={tdStyle}>
          <span style={{ ...mono('9px', 'var(--muted)'), textTransform: 'uppercase', letterSpacing: '1px' }}>{ws.type}</span>
        </td>
        <td style={tdStyle}>
          <span style={{ ...mono('9px', '#6dc87a'), textTransform: 'uppercase', letterSpacing: '1px' }}>{ws.plan || 'free'}</span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <span style={mono('12px', 'var(--gold)')}>{ws.creditBalance ?? 0}</span>
          <span style={{ ...mono('8px', 'var(--muted)'), marginLeft: '4px' }}>cr</span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <span style={mono('10px', 'var(--muted)')}>{ws.memberCount ?? '—'}</span>
        </td>
        <td style={tdStyle}>
          <span style={{ ...mono('9px', ws.managedBeta ? '#6dc87a' : 'var(--muted)'), textTransform: 'uppercase', letterSpacing: '1px' }}>
            {ws.managedBeta ? 'Yes' : 'No'}
          </span>
        </td>
        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
          <button
            onClick={() => setExpanded(x => !x)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} actions for ${ws.name}`}
            style={btnStyle('ghost')}
          >{expanded ? '▲ Less' : '▼ Actions'}</button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: '#0a0806', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

              {/* Credit adjustment */}
              <div>
                <div style={{ ...sectionLabel, marginBottom: '6px' }}>Grant / Deduct Credits</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    placeholder="Amount (neg = deduct)"
                    value={credits}
                    onChange={e => setCredits(e.target.value)}
                    aria-label={`Credit amount for ${ws.name}`}
                    style={{ ...inputStyle, width: '160px', padding: '6px 8px' }}
                  />
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={creditsNote}
                    onChange={e => setCreditsNote(e.target.value)}
                    aria-label={`Credit note for ${ws.name}`}
                    style={{ ...inputStyle, width: '150px', padding: '6px 8px' }}
                  />
                  <button onClick={handleCredits} disabled={busy || credits === ''} style={btnStyle('primary', busy || credits === '')} aria-label={`Apply credit change to ${ws.name}`}>Apply</button>
                </div>
              </div>

              {/* Managed beta toggle */}
              <div>
                <div style={{ ...sectionLabel, marginBottom: '6px' }}>Managed Generation</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleManaged(true)}  disabled={busy} style={btnStyle('primary', busy)} aria-label={`Enable managed generation for ${ws.name}`}>Enable</button>
                  <button onClick={() => handleManaged(false)} disabled={busy} style={btnStyle('danger',  busy)} aria-label={`Disable managed generation for ${ws.name}`}>Disable</button>
                </div>
              </div>

              {/* Info */}
              <div style={{ ...mono('9px', 'var(--muted)'), lineHeight: '1.8' }}>
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          type="text"
          placeholder="Search workspaces…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search workspaces by name or slug"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={() => search(query)} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Search workspaces">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {wsItems !== null && (
        <div style={{ ...mono('9px', 'var(--muted)'), letterSpacing: '1px', marginBottom: '10px' }}>
          {wsItems.length} workspace{wsItems.length !== 1 ? 's' : ''}
        </div>
      )}

      {loading && wsItems === null && <div style={mono('10px', 'var(--muted)')}>Loading…</div>}
      {wsItems !== null && wsItems.length === 0 && <div style={mono('10px', 'var(--muted)')}>No workspaces found.</div>}

      {wsItems !== null && wsItems.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Workspace management table">
            <thead>
              <tr>
                {['Name / Slug', 'Type', 'Plan', 'Credits', 'Members', 'Managed?', 'Actions'].map(h => (
                  <th key={h} scope="col" style={{ ...thStyle, textAlign: h === 'Credits' || h === 'Members' ? 'right' : 'left' }}>{h}</th>
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
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
        <select
          value={statusF}
          onChange={e => setStatusF(e.target.value)}
          aria-label="Filter by job status"
          style={{ ...inputStyle, padding: '6px 10px', cursor: 'pointer' }}
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
          style={{ ...inputStyle, padding: '6px 10px', cursor: 'pointer' }}
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
          style={{ ...inputStyle, padding: '6px 10px', cursor: 'pointer' }}
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>

        <button onClick={load} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Refresh jobs list">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary badges */}
      {summary && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {[['Queued', summary.queued, 'var(--muted)'], ['Active', summary.active, '#f0c040'], ['Done', summary.done, '#6dc87a'], ['Failed', summary.failed, '#f08080']].map(([label, count, color]) => (
            <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '6px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={mono('11px', color)}>{count ?? 0}</span>
              <span style={{ ...mono('8px', 'var(--muted)'), textTransform: 'uppercase', letterSpacing: '1.5px' }}>{label}</span>
            </div>
          ))}
          <div style={{ ...mono('9px', 'var(--muted)'), alignSelf: 'center', marginLeft: '4px' }}>
            Total: {total}
          </div>
        </div>
      )}

      {loading && jobs === null && <div style={mono('10px', 'var(--muted)')}>Loading jobs…</div>}
      {jobs !== null && jobs.length === 0 && <div style={mono('10px', 'var(--muted)')}>No jobs found with current filters.</div>}

      {jobs !== null && jobs.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Admin jobs table">
            <thead>
              <tr>
                {['Type', 'Tier', 'Status', 'Cost', 'Workspace', 'Created', 'Error'].map(h => (
                  <th key={h} scope="col" style={{ ...thStyle, textAlign: h === 'Cost' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const statusColor = JOB_STATUS_COLOR[job.status] ?? 'var(--muted)'
                return (
                  <tr key={job._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={tdStyle}>{job.type}</td>
                    <td style={{ ...tdStyle, color: 'var(--muted)' }}>{job.tier || '—'}</td>
                    <td style={{ ...tdStyle, color: statusColor, textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>{job.status}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--gold)' }}>{job.costUsd != null ? `$${job.costUsd.toFixed(4)}` : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--muted)', fontSize: '9px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.workspaceId}>{job.workspaceId ? String(job.workspaceId).slice(-8) : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {job.createdAt ? new Date(job.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: '#f08080', fontSize: '9px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.errorMessage}>
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
      style={{
        display: 'inline-block',
        width: '8px', height: '8px',
        borderRadius: '50%',
        background: ok ? '#6dc87a' : '#555',
        marginRight: '6px',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  )
}
StatusDot.propTypes = { ok: PropTypes.bool }

function ConfigRow({ label, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <StatusDot ok={ok} />
      <span style={mono('10px', ok ? 'var(--cream)' : 'var(--muted)')}>{label}</span>
      <span style={{ ...mono('8px', ok ? '#6dc87a' : 'var(--muted)'), marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '1px' }}>
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

  if (loading) return <div style={mono('10px', 'var(--muted)')}>Loading config…</div>
  if (!cfg) return null

  const managed   = cfg.managed   || {}
  const stripe    = cfg.stripe    || {}
  const plans     = cfg.plans     || {}
  const providers = cfg.providers || []
  const social    = cfg.social    || []

  return (
    <div>
      <div style={{ ...mono('9px', '#f08080'), letterSpacing: '1.5px', background: 'rgba(120,20,20,0.15)', border: '1px solid #804040', padding: '8px 12px', marginBottom: '18px' }}>
        Read-only status view — set API keys and configuration in .env.server
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

        {/* AI Providers */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
          <div style={sectionLabel}>AI Providers</div>
          {providers.length === 0 && <div style={mono('10px', 'var(--muted)')}>None listed.</div>}
          {providers.map(p => (
            <ConfigRow key={p.provider} label={p.provider} ok={p.configured} />
          ))}
        </div>

        {/* Social */}
        {social.length > 0 && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
            <div style={sectionLabel}>Social Providers</div>
            {social.map(s => (
              <ConfigRow key={s.key} label={s.label || s.key} ok={s.configured} />
            ))}
          </div>
        )}

        {/* Infrastructure */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
          <div style={sectionLabel}>Infrastructure</div>
          <ConfigRow label="Stripe" ok={stripe.configured} />
          <ConfigRow label="Redis" ok={cfg.redis?.configured} />
          {stripe.configured && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ ...mono('8px', 'var(--muted)'), letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Stripe Prices</div>
              {Object.entries(stripe.pricesConfigured || {}).map(([key, ok]) => (
                <ConfigRow key={key} label={key} ok={ok} />
              ))}
            </div>
          )}
        </div>

        {/* Managed Generation */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
          <div style={sectionLabel}>Managed Generation</div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <StatusDot ok={managed.enabled} />
            <span style={mono('10px', managed.enabled ? '#6dc87a' : '#f08080')}>{managed.enabled ? 'Enabled' : 'Disabled (kill-switch)'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={mono('9px', 'var(--muted)')}>Max Concurrent: <span style={mono('10px', 'var(--cream)')}>{managed.maxConcurrent ?? '—'}</span></div>
            <div style={mono('9px', 'var(--muted)')}>Starter Credits: <span style={mono('10px', 'var(--cream)')}>{managed.starterCredits ?? '—'}</span></div>
          </div>
          {managed.caps && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ ...mono('8px', 'var(--muted)'), letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Credit Caps</div>
              {Object.entries(managed.caps).map(([type, cap]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={mono('9px', 'var(--muted)')}>{type}</span>
                  <span style={mono('9px', 'var(--cream)')}>{cap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan matrix */}
      {Object.keys(plans).length > 0 && (
        <div style={{ marginTop: '20px', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px' }}>
          <div style={sectionLabel}>Plan Matrix</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Plan configuration matrix">
              <thead>
                <tr>
                  <th scope="col" style={{ ...thStyle, textAlign: 'left' }}>Plan</th>
                  <th scope="col" style={thStyle}>Credits</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'left' }}>Features</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(plans).map(([planKey, planData]) => (
                  <tr key={planKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ ...tdStyle, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px' }}>{planKey}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{planData.credits ?? '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--muted)', fontSize: '9px' }}>
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

      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={load} disabled={loading} style={btnStyle('ghost', loading)} aria-label="Refresh system config">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
SystemSection.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Sidebar nav ─────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'overview',   label: 'Overview'   },
  { key: 'funnel',     label: 'Funnel'     },
  { key: 'users',      label: 'Users'      },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'jobs',       label: 'Jobs'       },
  { key: 'system',     label: 'System'     },
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        minHeight: '52px',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          aria-label="Back to home"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            padding: '5px 12px',
            cursor: 'pointer',
            letterSpacing: '1px',
            flexShrink: 0,
          }}
        >← Back</button>

        <div style={{
          ...cinzel('14px', 'var(--gold)'),
          letterSpacing: '3px',
          textTransform: 'uppercase',
          flex: 1,
        }}>
          Admin — Manage App
        </div>

        {/* Admin warning badge */}
        <div style={{
          background: 'rgba(120,20,20,0.3)',
          border: '1px solid #804040',
          padding: '4px 12px',
          ...mono('8px', '#f08080'),
          letterSpacing: '2px',
          textTransform: 'uppercase',
          flexShrink: 0,
        }} role="note" aria-label="Admin-only zone">
          Admin Zone
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <nav
          aria-label="Admin dashboard sections"
          style={{
            width: '180px',
            flexShrink: 0,
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: '8px',
          }}
        >
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => { setSection(s.key); setMsg('') }}
              aria-current={s.key === section ? 'page' : undefined}
              style={{
                background: s.key === section ? 'rgba(200,146,42,0.1)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${s.key === section ? 'var(--gold)' : 'transparent'}`,
                color: s.key === section ? 'var(--gold)' : 'var(--muted)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                padding: '12px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'color 0.12s, background 0.12s',
              }}
            >{s.label}</button>
          ))}
        </nav>

        {/* Main content area */}
        <main
          aria-label={`${activeSection?.label ?? 'Admin'} section`}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 32px',
          }}
        >
          {/* Section heading */}
          <div style={{ marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
            <h1 style={{ ...cinzel('16px', 'var(--gold)'), margin: 0, textTransform: 'uppercase', letterSpacing: '3px' }}>
              {activeSection?.label}
            </h1>
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
        </main>
      </div>
    </div>
  )
}

AdminDashboard.propTypes = {
  onBack: PropTypes.func.isRequired,
}
