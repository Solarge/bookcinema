import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'
import { users as usersApi, analytics as analyticsApi, workspaces as workspacesApi, billing as billingApi, managed as managedApi } from '../../lib/api'
import { planFeatures } from '../../utils/planFeatures'
import DistributionPanel from '../social/DistributionPanel'
import { useDivModalA11y } from '../../hooks/useModalA11y'
import '../../styles/profile.css'

const PLAN_SUMMARIES = {
  free:   'Standard tiers only · watermark on exports',
  pro:    'Premium tiers unlocked · no watermark',
  studio: 'Premium tiers + white-label · no watermark',
}

// Display-only pricing constants — these MUST match the Stripe dashboard prices.
// Update here whenever Stripe prices change.
const PRICING = {
  plans: [
    { key: 'free',   label: 'Free',   price: '$0/mo',   credits: '25 credits/mo',   features: ['Text + image generation', 'Standard AI tier', 'Watermark on exports', '1 workspace seat'] },
    { key: 'pro',    label: 'Pro',    price: '$19/mo',  credits: '500 credits/mo',  features: ['+ Voice & video generation', 'Premium AI tiers', 'No watermark', 'Social scheduling', 'Team workspaces'] },
    { key: 'studio', label: 'Studio', price: '$79/mo',  credits: '2000 credits/mo', features: ['Everything in Pro', 'White-label branding', 'Higher limits', 'Dedicated support'] },
  ],
  packs: {
    pack_small:  { credits: 100,  price: '$4.99' },
    pack_medium: { credits: 500,  price: '$19.99' },
    pack_large:  { credits: 2000, price: '$69.99' },
  },
}

// Placeholder support contact — replace before launch
const SUPPORT_EMAIL = 'support@bookfilm.studio'

export default function ProfilePage({ onClose, initialTab = 'profile' }) {
  const { user, logout, updateUser, activeWorkspace, activeWorkspacePlan, activeCreditBalance } = useAuth()
  const panelRef = useRef(null)
  useDivModalA11y(onClose, panelRef)
  const [tab, setTab]               = useState(initialTab) // profile | security | apikey | analytics
  const [name, setName]             = useState(user?.name ?? '')
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')
  const [msgKind, setMsgKind]       = useState('success') // 'success' | 'error'
  const [apiKeyData, setApiKeyData] = useState(null)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [historyData, setHistoryData]     = useState(null)
  const [providersData, setProvidersData] = useState(null)
  const [jobsData, setJobsData]           = useState(null)
  const [jobsLoading, setJobsLoading]     = useState(false)
  const [members, setMembers]             = useState(null)
  const [wsList, setWsList]               = useState([])
  const [inviteEmail, setInviteEmail]     = useState('')
  const [newWsName, setNewWsName]         = useState('')
  const [wsRenaming, setWsRenaming]       = useState(false)
  const [wsNewName, setWsNewName]         = useState('')
  const [wlEnabled, setWlEnabled]         = useState(false)
  const [wlName, setWlName]               = useState('')
  const [wlColor, setWlColor]             = useState('')
  const [wsSaving, setWsSaving]           = useState(false)


  function setSuccess(text) { setMsg(text); setMsgKind('success') }
  function setError(text)   { setMsg(text); setMsgKind('error') }
  // Child panels (Admin/Distribution) report both success + failure through one onMsg —
  // style failure-looking messages as errors instead of green "success".
  function panelMsg(text) {
    const isErr = /error|failed|invalid|must be|not configured|insufficient|unavailable|required|denied/i.test(text || '')
    setMsg(text); setMsgKind(isErr ? 'error' : 'success')
  }

  async function saveProfile() {
    setSaving(true); setMsg('')
    try {
      const updated = await usersApi.update({ name })
      updateUser(updated)
      setSuccess('Profile updated')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function generateApiKey() {
    try {
      const data = await usersApi.generateKey()
      setApiKeyData(data)
    } catch (err) { setError(err.message) }
  }

  async function revokeApiKey() {
    try { await usersApi.revokeKey(); setApiKeyData(null); setSuccess('API key revoked') }
    catch (err) { setError(err.message) }
  }

  async function loadAnalytics() {
    try {
      const [summary, history, providers] = await Promise.all([
        analyticsApi.summary(30),
        analyticsApi.history(30),
        analyticsApi.providers(),
      ])
      setAnalyticsData(summary)
      setHistoryData(history)
      setProvidersData(providers)
    } catch (err) { setError(err.message) }
  }

  async function loadJobs() {
    setJobsLoading(true)
    try {
      const jobs = await managedApi.listJobs()
      setJobsData(jobs)
    } catch (err) { setError(err.message) }
    finally { setJobsLoading(false) }
  }

  async function loadWorkspace() {
    if (!activeWorkspace) return
    try {
      const [list, mems] = await Promise.all([
        workspacesApi.list(),
        workspacesApi.members(activeWorkspace),
      ])
      setWsList(list)
      setMembers(mems)
    } catch (err) { setError(err.message) }
  }

  // Auto-load data for the initial tab when the modal opens to a non-profile tab
  // (e.g. when opened from the Upgrade CTA which targets 'workspace')
  useEffect(() => {
    if (initialTab === 'workspace') loadWorkspace()
    if (initialTab === 'analytics') { loadAnalytics(); loadJobs() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentional: run once on mount only

  const TABS = ['profile', 'security', 'apikey', 'workspace', 'analytics', 'distribution']

  return (
    <div className="ds-modal-overlay" role="presentation" onClick={onClose} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="pp-modal-card"
        onClick={e => e.stopPropagation()}
      >

        <div className="pp-modal-header">
          <span id="profile-modal-title" className="pp-modal-title">
            ACCOUNT — {user?.name?.toUpperCase()}
          </span>
          <div className="pp-header-actions">
            <button onClick={logout} className="pp-signout-btn">Sign Out</button>
            <button onClick={onClose} aria-label="Close account dialog" className="pp-close-btn">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="pp-tabs">
          {TABS.map(t => (
            <button key={t} onClick={() => { setMsg(''); setTab(t); if (t === 'analytics') { loadAnalytics(); loadJobs() } if (t === 'workspace') loadWorkspace() }}
              aria-selected={t === tab}
              className="pp-tab"
            >{t}</button>
          ))}
        </div>

        <div className="pp-body">
          {msg && (
            <div
              role={msgKind === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`pp-msg pp-msg--${msgKind}`}
            >{msg}</div>
          )}

          {tab === 'profile' && (
            <div>
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={user?.email} disabled />
              <Field label="Plan" value={activeWorkspacePlan || 'free'} disabled />
              <Field label="Credits" value={String(activeCreditBalance ?? 0)} disabled />
              <button onClick={saveProfile} disabled={saving} className="pp-btn" style={saving ? { background: 'var(--border)', color: 'var(--muted)', cursor: 'not-allowed' } : undefined}>{saving ? 'Saving…' : 'Save Profile'}</button>

              {/* Plan comparison */}
              {(() => {
                const PLAN_RANK = { free: 0, pro: 1, studio: 2 }
                const currentPlan = activeWorkspacePlan || 'free'
                const currentRank = PLAN_RANK[currentPlan] ?? 0
                return (
                  <div className="pp-plans-section">
                    <div className="pp-section-eyebrow">Plan Comparison</div>
                    <div className="pp-plans-grid">
                      {PRICING.plans.map(plan => {
                        const isCurrent = currentPlan === plan.key
                        const planRank = PLAN_RANK[plan.key] ?? 0
                        const isUpgrade = planRank > currentRank
                        const isDowngrade = planRank < currentRank

                        const cardStyle = {
                          background: isCurrent ? 'rgba(200,146,42,0.08)' : 'var(--surface2)',
                          border: `1px solid ${isCurrent ? 'var(--gold)' : 'var(--border)'}`,
                          cursor: isUpgrade ? 'pointer' : 'default',
                          transition: isUpgrade ? 'border-color 0.15s, background 0.15s' : undefined,
                        }

                        const inner = (
                          <>
                            <div className="pp-plan-name" style={{ color: isCurrent ? 'var(--gold)' : 'var(--cream)' }}>{plan.label}</div>
                            <div className="pp-plan-price">{plan.price}</div>
                            <div className="pp-plan-credits">{plan.credits}</div>
                            {plan.features.map(f => (
                              <div key={f} className="pp-plan-feature">· {f}</div>
                            ))}
                            {isCurrent && (
                              <div className="pp-plan-badge">CURRENT</div>
                            )}
                            {isUpgrade && (
                              <div className="pp-plan-badge">Upgrade →</div>
                            )}
                            {isDowngrade && (
                              <button
                                onClick={async e => {
                                  e.stopPropagation()
                                  try { const { url } = await billingApi.portal(); window.location.href = url }
                                  catch (err) { setError(err.message) }
                                }}
                                className="pp-plan-manage-btn"
                              >Manage Billing</button>
                            )}
                          </>
                        )

                        if (isUpgrade) {
                          return (
                            <button
                              key={plan.key}
                              aria-label={`Upgrade to ${plan.label} plan`}
                              onClick={async () => {
                                try {
                                  const { url } = await billingApi.checkout({ kind: 'subscription', key: plan.key })
                                  window.location.href = url
                                } catch (err) {
                                  if (err.status === 503 || err.status === 404 || err.message?.toLowerCase().includes('not configured') || err.message?.toLowerCase().includes('billing')) {
                                    setError("Billing isn't configured yet")
                                  } else {
                                    setError(err.message)
                                  }
                                }
                              }}
                              className="pp-plan-card"
                              style={cardStyle}
                            >{inner}</button>
                          )
                        }

                        return (
                          <div key={plan.key} className="pp-plan-card" style={cardStyle}>{inner}</div>
                        )
                      })}
                    </div>
                    <div className="pp-pricing-disclaimer">
                      Prices displayed are indicative. Actual charges are confirmed at checkout via Stripe.
                    </div>
                  </div>
                )
              })()}

              {/* Support */}
              <div className="pp-support-section">
                <div className="pp-section-eyebrow pp-section-eyebrow--sm">Support</div>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="pp-support-link"
                >
                  Need help? Contact support →
                </a>
              </div>

              {/* Data & Privacy */}
              <div className="pp-privacy-section">
                <div className="pp-section-eyebrow">Data &amp; Privacy</div>

                <button
                  onClick={async () => {
                    setMsg('')
                    try {
                      const data = await usersApi.exportData()
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'bookfilm-my-data.json'
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                      setSuccess('Data export downloaded.')
                    } catch (err) { setError(err.message) }
                  }}
                  className="pp-btn pp-btn--block-mb"
                >Export My Data</button>

                <button
                  onClick={async () => {
                    if (!window.confirm('Permanently delete your account and all your data? This cannot be undone.')) return
                    setMsg('')
                    try {
                      await usersApi.deleteAccount()
                      logout()
                    } catch (err) { setError(err.message) }
                  }}
                  className="pp-delete-btn"
                >Delete Account</button>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <div className="pp-security-hint">Change your password below. You'll need your current password.</div>
              <PasswordChanger onSuccess={setSuccess} onError={setError} />
            </div>
          )}

          {tab === 'apikey' && (
            <div>
              <div className="pp-apikey-intro">
                Use your API key to access BookFilm Studio programmatically.<br />
                Keep it secret — it grants full account access.
              </div>
              {apiKeyData ? (
                <div>
                  <div className="pp-apikey-warn">⚠ Copy this now — it won't be shown again:</div>
                  <div className="pp-apikey-value">{apiKeyData.apiKey}</div>
                </div>
              ) : (
                <div className="pp-apikey-prefix">
                  Prefix: {user?.apiKeyPrefix || 'No API key generated'}
                </div>
              )}
              <div className="pp-apikey-actions">
                <button onClick={generateApiKey} className="pp-btn">Generate New Key</button>
                <button onClick={revokeApiKey} className="pp-btn pp-apikey-revoke-btn">Revoke</button>
              </div>
            </div>
          )}

          {tab === 'workspace' && (
            <div>
              {/* Current workspace info */}
              {(() => {
                const ws = wsList.find(w => w._id === activeWorkspace)
                const creditBalance = ws?.creditBalance ?? 0
                return ws ? (
                  <div className="pp-ws-card">
                    <div className="pp-ws-name">{ws.name}</div>
                    <div className="pp-ws-meta-row">
                      <span className="pp-ws-meta-item">Type: <span className="pp-ws-meta-value">{ws.type}</span></span>
                      <span className="pp-ws-meta-item">Plan: <span className="pp-ws-meta-value">{ws.plan}</span></span>
                    </div>
                    <div className="pp-ws-divider">
                      <div className="pp-ws-credit-row">
                        <span className="pp-ws-credit-number">{creditBalance}</span>
                        <span className="pp-ws-credit-label">Credits</span>
                      </div>
                      <div className="pp-ws-credit-hint" style={{ marginBottom: creditBalance === 0 ? '8px' : '0' }}>
                        Used by managed generation (text 1, voice 1–5, image 4–10 per generation).
                      </div>
                      {creditBalance === 0 && (
                        <div className="pp-ws-credits-empty">
                          Out of credits — managed generation is paused. Ask an admin to grant credits.
                        </div>
                      )}
                    </div>
                    {/* Plan summary */}
                    <div className="pp-ws-plan-row">
                      <div className="pp-ws-plan-header">
                        <span className="pp-ws-plan-eyebrow">Plan</span>
                        <span className="pp-ws-plan-name" style={{ color: planFeatures(ws.plan).premium ? 'var(--gold)' : 'var(--cream)' }}>{ws.plan || 'free'}</span>
                      </div>
                      <div className="pp-ws-plan-summary">
                        {PLAN_SUMMARIES[ws.plan] || PLAN_SUMMARIES.free}
                      </div>
                    </div>

                    {/* Per-seat billing line (org + paid plan) */}
                    {ws.type === 'organization' && (ws.plan === 'pro' || ws.plan === 'studio') && (
                      <div className="pp-ws-seat-billing">
                        <div className="pp-ws-seat-text">
                          Billed per seat — <span className="pp-ws-seat-value">{(members ?? ws.members ?? []).length} × {ws.plan}</span>
                        </div>
                      </div>
                    )}

                    {/* Credit breakdown */}
                    <div className="pp-credits-section">
                      <div className="pp-credits-eyebrow">Credit Breakdown</div>
                      <div className="pp-credits-grid">
                        {[
                          ['Monthly', ws.monthlyCredits ?? 0],
                          ['Purchased', ws.purchasedCredits ?? 0],
                          ['Total', ws.creditBalance ?? ((ws.monthlyCredits ?? 0) + (ws.purchasedCredits ?? 0))],
                        ].map(([label, val]) => (
                          <div key={label} className="pp-credit-tile">
                            <div className={`pp-credit-tile-value ${label === 'Total' ? 'pp-credit-tile-value--total' : 'pp-credit-tile-value--normal'}`}>{val}</div>
                            <div className="pp-credit-tile-label">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Upgrade subscriptions */}
                    {ws.plan !== 'studio' && (
                      <div className="pp-upgrade-section">
                        <div className="pp-upgrade-eyebrow">Upgrade Plan</div>
                        <div className="pp-upgrade-row">
                          {ws.plan !== 'pro' && (
                            <button
                              onClick={async () => {
                                try { const { url } = await billingApi.checkout({ kind: 'subscription', key: 'pro' }); window.location.href = url }
                                catch (err) { setError(err.message) }
                              }}
                              className="pp-btn"
                            >Upgrade to Pro</button>
                          )}
                          <button
                            onClick={async () => {
                              try { const { url } = await billingApi.checkout({ kind: 'subscription', key: 'studio' }); window.location.href = url }
                              catch (err) { setError(err.message) }
                            }}
                            className="pp-btn"
                          >Upgrade to Studio</button>
                        </div>
                      </div>
                    )}

                    {/* Buy credit packs */}
                    <div className="pp-upgrade-section">
                      <div className="pp-upgrade-eyebrow">Buy Credits</div>
                      <div className="pp-upgrade-row">
                        {[
                          ['pack_small'],
                          ['pack_medium'],
                          ['pack_large'],
                        ].map(([key]) => {
                          const pack = PRICING.packs[key]
                          return (
                            <button
                              key={key}
                              onClick={async () => {
                                try { const { url } = await billingApi.checkout({ kind: 'pack', key }); window.location.href = url }
                                catch (err) { setError(err.message) }
                              }}
                              className="pp-btn pp-pack-btn"
                            >{pack.credits} credits — {pack.price}</button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Manage billing */}
                    <div className="pp-billing-section">
                      <button
                        onClick={async () => {
                          try { const { url } = await billingApi.portal(); window.location.href = url }
                          catch (err) { setError(err.message) }
                        }}
                        className="pp-btn pp-manage-billing-btn"
                      >Manage Billing</button>
                    </div>
                  </div>
                ) : null
              })()}

              {/* Workspace rename + white-label settings (owner only) */}
              {(() => {
                const ws = wsList.find(w => w._id === activeWorkspace)
                if (!ws) return null
                const isOwner = ws.ownerId === user?._id || String(ws.ownerId) === String(user?._id)
                if (!isOwner) return null
                const hasWhiteLabel = planFeatures(ws.plan).whiteLabel
                return (
                  <div className="pp-ws-settings">
                    <div className="pp-ws-settings-eyebrow">Workspace Settings</div>

                    {/* Rename */}
                    <div className="pp-ws-rename-field">
                      <div className="pp-ws-rename-eyebrow">Name</div>
                      {wsRenaming ? (
                        <div className="pp-ws-rename-row">
                          <input
                            autoFocus
                            type="text"
                            value={wsNewName}
                            onChange={e => setWsNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setWsRenaming(false) }}
                            aria-label="New workspace name"
                            className="pp-ws-rename-input"
                          />
                          <button
                            onClick={async () => {
                              if (!wsNewName.trim()) return
                              setWsSaving(true)
                              try {
                                await workspacesApi.update(activeWorkspace, { name: wsNewName.trim() })
                                setWsRenaming(false)
                                setSuccess('Workspace renamed')
                                await loadWorkspace()
                              } catch (err) { setError(err.message) }
                              finally { setWsSaving(false) }
                            }}
                            disabled={wsSaving}
                            className="pp-btn"
                            style={wsSaving ? { background: 'var(--border)', color: 'var(--muted)', cursor: 'not-allowed' } : undefined}
                          >{wsSaving ? '…' : 'Save'}</button>
                          <button onClick={() => setWsRenaming(false)} className="pp-ws-cancel-btn">Cancel</button>
                        </div>
                      ) : (
                        <div className="pp-ws-display-row">
                          <span className="pp-ws-display-name">{ws.name}</span>
                          <button
                            onClick={() => { setWsNewName(ws.name); setWsRenaming(true) }}
                            aria-label="Rename workspace"
                            className="pp-ws-rename-btn"
                          >✎ Rename</button>
                        </div>
                      )}
                    </div>

                    {/* White-label (studio plan only) */}
                    {hasWhiteLabel && (
                      <div>
                        <div className="pp-wl-eyebrow">White-Label Branding</div>
                        <label className="pp-wl-toggle-label">
                          <input
                            type="checkbox"
                            checked={wlEnabled}
                            onChange={e => setWlEnabled(e.target.checked)}
                            aria-label="Enable white-label branding"
                            className="pp-wl-checkbox"
                          />
                          <span className="pp-wl-toggle-text">Enable white-label</span>
                        </label>
                        {wlEnabled && (
                          <div className="pp-wl-fields">
                            <div>
                              <div className="pp-wl-field-eyebrow">Brand Name</div>
                              <input
                                type="text"
                                placeholder="e.g. Acme Studio"
                                value={wlName}
                                onChange={e => setWlName(e.target.value)}
                                aria-label="White-label brand name"
                                className="pp-wl-input"
                              />
                            </div>
                            <div>
                              <div className="pp-wl-field-eyebrow">Brand Color (hex)</div>
                              <input
                                type="text"
                                placeholder="#c8921a"
                                value={wlColor}
                                onChange={e => setWlColor(e.target.value)}
                                aria-label="White-label brand color hex value"
                                className="pp-wl-input"
                              />
                            </div>
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            setWsSaving(true)
                            try {
                              const whiteLabel = wlEnabled ? { enabled: true, name: wlName || undefined, color: wlColor || undefined } : { enabled: false }
                              await workspacesApi.update(activeWorkspace, { settings: { whiteLabel } })
                              setSuccess('White-label settings saved')
                              await loadWorkspace()
                            } catch (err) { setError(err.message) }
                            finally { setWsSaving(false) }
                          }}
                          disabled={wsSaving}
                          className="pp-btn"
                          style={{ marginTop: '10px', ...(wsSaving ? { background: 'var(--border)', color: 'var(--muted)', cursor: 'not-allowed' } : {}) }}
                        >{wsSaving ? 'Saving…' : 'Save Branding'}</button>
                      </div>
                    )}
                    {!hasWhiteLabel && (
                      <div className="pp-wl-no-plan">
                        White-label branding requires the Studio plan.
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Members list */}
              {(() => {
                const ws = wsList.find(w => w._id === activeWorkspace)
                const memberCount = members?.length ?? 0
                return ws?.type === 'organization' ? (
                  <div className="pp-members-header">
                    <div className="pp-members-eyebrow">Members</div>
                    <div className="pp-members-count-box">
                      <span className="pp-members-count-num">{memberCount}</span>
                      <span className="pp-members-count-label">Seats</span>
                    </div>
                  </div>
                ) : (
                  <div className="pp-members-eyebrow pp-members-eyebrow--solo">Members</div>
                )
              })()}
              {members === null ? (
                <div className="pp-members-loading">Loading…</div>
              ) : (
                <div className="pp-members-list">
                  {members.map((member, i) => {
                    const memberUserId = member.userId?._id ?? member.userId
                    const memberName   = member.userId?.name  ?? String(memberUserId)
                    const memberEmail  = member.userId?.email ?? ''
                    const isOwner      = member.role === 'owner'
                    return (
                      <div key={memberUserId ?? i} className="pp-member-row">
                        <div className="pp-member-info">
                          <div className="pp-member-name">{memberName}</div>
                          {memberEmail && <div className="pp-member-email">{memberEmail}</div>}
                        </div>
                        {isOwner ? (
                          <span className="pp-member-owner-badge">owner</span>
                        ) : (
                          <>
                            <select
                              value={member.role}
                              onChange={async e => {
                                try {
                                  await workspacesApi.updateMember(activeWorkspace, memberUserId, { role: e.target.value })
                                  await loadWorkspace()
                                } catch (err) { setError(err.message) }
                              }}
                              className="pp-member-role-select"
                            >
                              <option value="admin">admin</option>
                              <option value="member">member</option>
                            </select>
                            <button
                              onClick={async () => {
                                try {
                                  await workspacesApi.removeMember(activeWorkspace, memberUserId)
                                  await loadWorkspace()
                                } catch (err) { setError(err.message) }
                              }}
                              className="pp-member-remove-btn"
                            >Remove</button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Invite row */}
              <div className="pp-invite-eyebrow">Invite Member</div>
              <div className="pp-invite-row">
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  aria-label="Invite member by email"
                  className="pp-text-input"
                />
                <button
                  onClick={async () => {
                    try {
                      const res = await workspacesApi.invite(activeWorkspace, { email: inviteEmail, role: 'member' })
                      setSuccess(res.message)
                      setInviteEmail('')
                    } catch (err) {
                      if (err.code === 'seat_limit' || err.status === 402) {
                        setError('Upgrade to a paid plan to add team members — use the Upgrade buttons above.')
                      } else {
                        setError(err.message)
                      }
                    }
                  }}
                  className="pp-btn"
                >Invite</button>
              </div>

              {/* Create organization workspace row */}
              <div className="pp-create-org-eyebrow">Create Organization</div>
              <div className="pp-create-org-row">
                <input
                  type="text"
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  aria-label="New organization workspace name"
                  className="pp-text-input"
                />
                <button
                  onClick={async () => {
                    try {
                      await workspacesApi.create({ name: newWsName })
                      setSuccess('Workspace created')
                      setNewWsName('')
                      await loadWorkspace()
                    } catch (err) { setError(err.message) }
                  }}
                  className="pp-btn"
                >Create</button>
              </div>
            </div>
          )}

          {tab === 'analytics' && analyticsData && (
            <div>
              {/* ── Summary tiles ── */}
              <div className="pp-analytics-tiles">
                {[
                  ['Series Generated', analyticsData.stats.totalSeries ?? 0],
                  ['Images', analyticsData.stats.totalImages ?? 0],
                  ['Videos', analyticsData.stats.totalVideos ?? 0],
                  ['Voice Lines', analyticsData.stats.totalVoice ?? 0],
                  ['Total Spent', `$${(analyticsData.stats.totalCost ?? 0).toFixed(3)}`],
                  ['Total Series (all time)', analyticsData.seriesCount],
                ].map(([label, value]) => (
                  <div key={label} className="pp-analytics-tile">
                    <div className="pp-analytics-tile-value">{value}</div>
                    <div className="pp-analytics-tile-label">{label}</div>
                  </div>
                ))}
              </div>
              <a href={analyticsApi.exportCSV()} download className="pp-export-csv-link">
                ⬇ Export CSV
              </a>

              {/* ── Daily history ── */}
              {historyData && historyData.length > 0 && (
                <div className="pp-analytics-section">
                  <div className="pp-analytics-section-eyebrow">Daily Breakdown (last 30 days)</div>
                  <div className="pp-table-scroll">
                    <table className="pp-table" aria-label="Daily usage breakdown">
                      <thead>
                        <tr>
                          {['Date', 'Images', 'Videos', 'Voice', 'Cost'].map(h => (
                            <th key={h} scope="col" className={h === 'Date' ? 'pp-th-left' : 'pp-th-right'}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map(row => (
                          <tr key={row._id}>
                            <td className="pp-td-date">{row._id}</td>
                            <td className="pp-td-muted">{row.images ?? 0}</td>
                            <td className="pp-td-muted">{row.videos ?? 0}</td>
                            <td className="pp-td-muted">{row.voice ?? 0}</td>
                            <td className="pp-td-gold">${(row.cost ?? 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {historyData && historyData.length === 0 && (
                <div className="pp-analytics-section pp-analytics-section--compact">
                  <div className="pp-jobs-empty">No daily history in the last 30 days.</div>
                </div>
              )}

              {/* ── Provider breakdown ── */}
              {providersData && providersData.length > 0 && (
                <div className="pp-analytics-section">
                  <div className="pp-analytics-section-eyebrow">Provider Usage</div>
                  <div className="pp-table-scroll">
                    <table className="pp-table" aria-label="Provider usage breakdown">
                      <thead>
                        <tr>
                          {['Action', 'Provider', 'Count', 'Total Cost', 'Success %'].map(h => (
                            <th key={h} scope="col" className={h === 'Action' || h === 'Provider' ? 'pp-th-left' : 'pp-th-right'}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {providersData.map((row, i) => (
                          <tr key={i}>
                            <td className="pp-td-left">{row._id?.action ?? '—'}</td>
                            <td className="pp-td-muted-l">{row._id?.provider ?? '—'}</td>
                            <td className="pp-td-muted">{row.count}</td>
                            <td className="pp-td-gold">${(row.totalCost ?? 0).toFixed(4)}</td>
                            <td className="pp-td-status" style={{ color: row.successRate >= 0.9 ? '#6dc87a' : '#f0a050' }}>{((row.successRate ?? 0) * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Recent Jobs ── */}
              <div className="pp-analytics-section">
                <div className="pp-jobs-header">
                  <div className="pp-jobs-eyebrow">Recent Jobs</div>
                  <button
                    onClick={loadJobs}
                    disabled={jobsLoading}
                    aria-label="Refresh jobs list"
                    className="pp-jobs-refresh-btn"
                  >{jobsLoading ? '…' : '↻ Refresh'}</button>
                </div>
                {jobsData === null ? (
                  <div className="pp-jobs-empty">Loading…</div>
                ) : jobsData.length === 0 ? (
                  <div className="pp-jobs-empty">No managed jobs yet.</div>
                ) : (
                  <div className="pp-table-scroll">
                    <table className="pp-table" aria-label="Recent managed generation jobs">
                      <thead>
                        <tr>
                          {['Type', 'Tier', 'Status', 'Created', 'Cost'].map(h => (
                            <th key={h} scope="col" className={h === 'Type' || h === 'Tier' ? 'pp-th-left' : 'pp-th-right'}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {jobsData.map(job => {
                          const statusColor = job.status === 'done' ? '#6dc87a' : job.status === 'failed' ? '#f08080' : job.status === 'active' ? '#f0c040' : 'var(--muted)'
                          return (
                            <tr key={job.id}>
                              <td className="pp-td-left">{job.type}</td>
                              <td className="pp-td-muted-l">{job.tier}</td>
                              <td className="pp-td-status" style={{ color: statusColor }}>{job.status}</td>
                              <td className="pp-td-date-small">{job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                              <td className="pp-td-gold">{job.costUsd != null ? `$${job.costUsd.toFixed(4)}` : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'distribution' && (
            <DistributionPanel
              onMsg={panelMsg}
              onOpenBilling={() => { setMsg(''); setTab('workspace'); loadWorkspace() }}
            />
          )}

        </div>
      </div>
    </div>
  )
}

ProfilePage.propTypes = {
  onClose:    PropTypes.func.isRequired,
  initialTab: PropTypes.string,
}

function Field({ label, value, onChange, disabled }) {
  return (
    <div className="pp-field">
      <div className="pp-field-label">{label}</div>
      <input type="text" value={value || ''} onChange={onChange ? e => onChange(e.target.value) : undefined} disabled={disabled}
        className={`pp-field-input ${disabled ? 'pp-field-input--disabled' : 'pp-field-input--active'}`} />
    </div>
  )
}
Field.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string, onChange: PropTypes.func, disabled: PropTypes.bool }

function PasswordChanger({ onSuccess, onError }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!current || !next) return onError('Both fields required')
    if (next.length < 8) return onError('New password min 8 chars')
    setLoading(true)
    try { await usersApi.changePass({ currentPassword: current, newPassword: next }); onSuccess('Password changed'); setCurrent(''); setNext('') }
    catch (err) { onError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} aria-label="Current password" className="pp-pw-input" />
      <input type="password" placeholder="New password (min 8 chars)" value={next} onChange={e => setNext(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} aria-label="New password (minimum 8 characters)" className="pp-pw-input pp-pw-input--last" />
      <button onClick={save} disabled={loading} className="pp-btn" style={loading ? { background: 'var(--border)', color: 'var(--muted)', cursor: 'not-allowed' } : undefined}>{loading ? 'Saving…' : 'Change Password'}</button>
    </div>
  )
}
PasswordChanger.propTypes = { onSuccess: PropTypes.func.isRequired, onError: PropTypes.func.isRequired }
