import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'
import { users as usersApi, analytics as analyticsApi, workspaces as workspacesApi, billing as billingApi, managed as managedApi } from '../../lib/api'
import { planFeatures } from '../../utils/planFeatures'
import DistributionPanel from '../social/DistributionPanel'
import AdminPanel from './AdminPanel'
import { useDivModalA11y } from '../../hooks/useModalA11y'

const PLAN_SUMMARIES = {
  free:   'Standard tiers only · watermark on exports',
  pro:    'Premium tiers unlocked · no watermark',
  studio: 'Premium tiers + white-label · no watermark',
}

// Display-only pricing constants — these MUST match the Stripe dashboard prices.
// Update here whenever Stripe prices change.
const PRICING = {
  plans: [
    { key: 'free',   label: 'Free',   price: '$0/mo',   credits: '10 credits/mo',  features: ['Standard AI tiers', 'Watermark on exports', 'BYO API keys', '1 workspace'] },
    { key: 'pro',    label: 'Pro',    price: '$19/mo',  credits: '200 credits/mo', features: ['Premium AI tiers', 'No watermark', 'Priority generation', 'Team workspaces'] },
    { key: 'studio', label: 'Studio', price: '$79/mo',  credits: '1000 credits/mo',features: ['Everything in Pro', 'White-label branding', 'API access', 'Dedicated support'] },
  ],
  packs: {
    pack_small:  { credits: 100,  price: '$4.99' },
    pack_medium: { credits: 500,  price: '$19.99' },
    pack_large:  { credits: 2000, price: '$69.99' },
  },
}

// Placeholder support contact — replace before launch
const SUPPORT_EMAIL = 'support@bookfilm.studio'

export default function ProfilePage({ onClose }) {
  const { user, logout, updateUser, activeWorkspace, isAdmin } = useAuth()
  const panelRef = useRef(null)
  useDivModalA11y(onClose, panelRef)
  const [tab, setTab]               = useState('profile') // profile | security | apikey | analytics
  const [name, setName]             = useState(user?.name ?? '')
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')
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


  async function saveProfile() {
    setSaving(true); setMsg('')
    try {
      const updated = await usersApi.update({ name })
      updateUser(updated)
      setMsg('Profile updated')
    } catch (err) { setMsg(err.message) }
    finally { setSaving(false) }
  }

  async function generateApiKey() {
    try {
      const data = await usersApi.generateKey()
      setApiKeyData(data)
    } catch (err) { setMsg(err.message) }
  }

  async function revokeApiKey() {
    try { await usersApi.revokeKey(); setApiKeyData(null); setMsg('API key revoked') }
    catch (err) { setMsg(err.message) }
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
    } catch (err) { setMsg(err.message) }
  }

  async function loadJobs() {
    setJobsLoading(true)
    try {
      const jobs = await managedApi.listJobs()
      setJobsData(jobs)
    } catch (err) { setMsg(err.message) }
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
    } catch (err) { setMsg(err.message) }
  }

  const TABS = ['profile', 'security', 'apikey', 'workspace', 'analytics', 'distribution', ...(isAdmin ? ['admin'] : [])]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} role="presentation" onClick={onClose} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >

        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span id="profile-modal-title" style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>
            ACCOUNT — {user?.name?.toUpperCase()}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={logout} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid #804040', color: '#f08080', cursor: 'pointer' }}>Sign Out</button>
            <button onClick={onClose} aria-label="Close account dialog" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'analytics') { loadAnalytics(); loadJobs() } if (t === 'workspace') loadWorkspace() }} style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: t === tab ? '2px solid var(--gold)' : '2px solid transparent',
              color: t === tab ? 'var(--gold)' : 'var(--muted)',
              padding: '10px 4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {msg && <div role="status" aria-live="polite" style={{ background: '#0a2010', border: '1px solid #3a7a4a', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6dc87a', marginBottom: '16px' }}>{msg}</div>}

          {tab === 'profile' && (
            <div>
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={user?.email} disabled />
              <Field label="Plan" value={user?.plan} disabled />
              <Field label="Credits" value={String(user?.credits ?? 0)} disabled />
              <button onClick={saveProfile} disabled={saving} style={btn(saving)}>{saving ? 'Saving…' : 'Save Profile'}</button>

              {/* Plan comparison */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>Plan Comparison</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
                  {PRICING.plans.map(plan => {
                    const isCurrent = (user?.plan || 'free') === plan.key
                    return (
                      <div key={plan.key} style={{ background: isCurrent ? 'rgba(200,146,42,0.08)' : 'var(--surface2)', border: `1px solid ${isCurrent ? 'var(--gold)' : 'var(--border)'}`, padding: '12px 10px' }}>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: isCurrent ? 'var(--gold)' : 'var(--cream)', letterSpacing: '1px', marginBottom: '2px', textTransform: 'uppercase' }}>{plan.label}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--gold)', marginBottom: '6px' }}>{plan.price}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: '#6dc87a', marginBottom: '8px' }}>{plan.credits}</div>
                        {plan.features.map(f => (
                          <div key={f} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', marginBottom: '3px', lineHeight: '1.4' }}>· {f}</div>
                        ))}
                        {isCurrent && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--gold)', letterSpacing: '1px', marginTop: '6px' }}>CURRENT</div>}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: '#2a3a4a', marginTop: '4px' }}>
                  Prices displayed are indicative. Actual charges are confirmed at checkout via Stripe.
                </div>
              </div>

              {/* Support */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '16px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Support</div>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--gold)', textDecoration: 'underline' }}
                >
                  Need help? Contact support →
                </a>
              </div>

              {/* Data & Privacy */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '20px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>Data &amp; Privacy</div>

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
                      setMsg('Data export downloaded.')
                    } catch (err) { setMsg(err.message) }
                  }}
                  style={{ ...btn(false), marginBottom: '10px', display: 'block', width: '100%' }}
                >Export My Data</button>

                <button
                  onClick={async () => {
                    if (!window.confirm('Permanently delete your account and all your data? This cannot be undone.')) return
                    setMsg('')
                    try {
                      await usersApi.deleteAccount()
                      logout()
                    } catch (err) { setMsg(err.message) }
                  }}
                  style={{ display: 'block', width: '100%', background: 'transparent', color: '#f08080', border: '1px solid #804040', padding: '10px 20px', fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' }}
                >Delete Account</button>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '16px' }}>Change your password below. You'll need your current password.</div>
              <PasswordChanger onMsg={setMsg} />
            </div>
          )}

          {tab === 'apikey' && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '16px' }}>
                Use your API key to access BookFilm Studio programmatically.<br />
                Keep it secret — it grants full account access.
              </div>
              {apiKeyData ? (
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6dc87a', marginBottom: '8px' }}>⚠ Copy this now — it won't be shown again:</div>
                  <div style={{ background: '#0a0806', border: '1px solid #3a7a4a', padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#6dc87a', wordBreak: 'break-all', marginBottom: '12px' }}>{apiKeyData.apiKey}</div>
                </div>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', marginBottom: '16px' }}>
                  Prefix: {user?.apiKeyPrefix || 'No API key generated'}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={generateApiKey} style={btn(false)}>Generate New Key</button>
                <button onClick={revokeApiKey} style={{ ...btn(false), background: 'transparent', color: '#f08080', border: '1px solid #804040' }}>Revoke</button>
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
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '20px' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '2px', marginBottom: '6px' }}>{ws.name}</div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Type: <span style={{ color: 'var(--cream)' }}>{ws.type}</span></span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Plan: <span style={{ color: 'var(--cream)' }}>{ws.plan}</span></span>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '26px', color: 'var(--gold)', lineHeight: 1 }}>{creditBalance}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>Credits</span>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: creditBalance === 0 ? '8px' : '0' }}>
                        Used by managed generation (text 1, voice 1–5, image 4–10 per generation).
                      </div>
                      {creditBalance === 0 && (
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f0a050', marginTop: '2px' }}>
                          Out of credits — managed generation is paused. Ask an admin to grant credits.
                        </div>
                      )}
                    </div>
                    {/* Plan summary */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>Plan</span>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: planFeatures(ws.plan).premium ? 'var(--gold)' : 'var(--cream)', letterSpacing: '1.5px', textTransform: 'capitalize' }}>{ws.plan || 'free'}</span>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', lineHeight: '1.6' }}>
                        {PLAN_SUMMARIES[ws.plan] || PLAN_SUMMARIES.free}
                      </div>
                    </div>

                    {/* Per-seat billing line (org + paid plan) */}
                    {ws.type === 'organization' && (ws.plan === 'pro' || ws.plan === 'studio') && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px' }}>
                          Billed per seat — <span style={{ color: 'var(--cream)' }}>{(members ?? ws.members ?? []).length} × {ws.plan}</span>
                        </div>
                      </div>
                    )}

                    {/* Credit breakdown */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Credit Breakdown</div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {[
                          ['Monthly', ws.monthlyCredits ?? 0],
                          ['Purchased', ws.purchasedCredits ?? 0],
                          ['Total', ws.creditBalance ?? ((ws.monthlyCredits ?? 0) + (ws.purchasedCredits ?? 0))],
                        ].map(([label, val]) => (
                          <div key={label} style={{ background: '#0a0806', border: '1px solid var(--border)', padding: '8px 12px', minWidth: '80px', textAlign: 'center' }}>
                            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: label === 'Total' ? 'var(--gold)' : 'var(--cream)', lineHeight: 1 }}>{val}</div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '3px' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Upgrade subscriptions */}
                    {ws.plan !== 'studio' && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Upgrade Plan</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {ws.plan !== 'pro' && (
                            <button
                              onClick={async () => {
                                try { const { url } = await billingApi.checkout({ kind: 'subscription', key: 'pro' }); window.location.href = url }
                                catch (err) { setMsg(err.message) }
                              }}
                              style={btn(false)}
                            >Upgrade to Pro</button>
                          )}
                          <button
                            onClick={async () => {
                              try { const { url } = await billingApi.checkout({ kind: 'subscription', key: 'studio' }); window.location.href = url }
                              catch (err) { setMsg(err.message) }
                            }}
                            style={btn(false)}
                          >Upgrade to Studio</button>
                        </div>
                      </div>
                    )}

                    {/* Buy credit packs */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Buy Credits</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                                catch (err) { setMsg(err.message) }
                              }}
                              style={{ ...btn(false), background: 'var(--surface2)', color: 'var(--gold)', border: '1px solid var(--gold)' }}
                            >{pack.credits} credits — {pack.price}</button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Manage billing */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                      <button
                        onClick={async () => {
                          try { const { url } = await billingApi.portal(); window.location.href = url }
                          catch (err) { setMsg(err.message) }
                        }}
                        style={{ ...btn(false), background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
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
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px', marginBottom: '20px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>Workspace Settings</div>

                    {/* Rename */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Name</div>
                      {wsRenaming ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            autoFocus
                            type="text"
                            value={wsNewName}
                            onChange={e => setWsNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setWsRenaming(false) }}
                            aria-label="New workspace name"
                            style={{ flex: 1, background: '#0a0806', border: '1px solid var(--gold)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '9px 12px', outline: 'none' }}
                          />
                          <button
                            onClick={async () => {
                              if (!wsNewName.trim()) return
                              setWsSaving(true)
                              try {
                                await workspacesApi.update(activeWorkspace, { name: wsNewName.trim() })
                                setWsRenaming(false)
                                setMsg('Workspace renamed')
                                await loadWorkspace()
                              } catch (err) { setMsg(err.message) }
                              finally { setWsSaving(false) }
                            }}
                            disabled={wsSaving}
                            style={btn(wsSaving)}
                          >{wsSaving ? '…' : 'Save'}</button>
                          <button onClick={() => setWsRenaming(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '9px 14px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--cream)' }}>{ws.name}</span>
                          <button
                            onClick={() => { setWsNewName(ws.name); setWsRenaming(true) }}
                            aria-label="Rename workspace"
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '4px 10px', cursor: 'pointer', letterSpacing: '1px' }}
                          >✎ Rename</button>
                        </div>
                      )}
                    </div>

                    {/* White-label (studio plan only) */}
                    {hasWhiteLabel && (
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>White-Label Branding</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={wlEnabled}
                            onChange={e => setWlEnabled(e.target.checked)}
                            aria-label="Enable white-label branding"
                            style={{ accentColor: 'var(--gold)', width: '14px', height: '14px' }}
                          />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--cream)' }}>Enable white-label</span>
                        </label>
                        {wlEnabled && (
                          <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Brand Name</div>
                              <input
                                type="text"
                                placeholder="e.g. Acme Studio"
                                value={wlName}
                                onChange={e => setWlName(e.target.value)}
                                aria-label="White-label brand name"
                                style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Brand Color (hex)</div>
                              <input
                                type="text"
                                placeholder="#c8921a"
                                value={wlColor}
                                onChange={e => setWlColor(e.target.value)}
                                aria-label="White-label brand color hex value"
                                style={{ width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }}
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
                              setMsg('White-label settings saved')
                              await loadWorkspace()
                            } catch (err) { setMsg(err.message) }
                            finally { setWsSaving(false) }
                          }}
                          disabled={wsSaving}
                          style={{ ...btn(wsSaving), marginTop: '10px' }}
                        >{wsSaving ? 'Saving…' : 'Save Branding'}</button>
                      </div>
                    )}
                    {!hasWhiteLabel && (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', fontStyle: 'italic' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>Members</div>
                    <div style={{ background: '#0a0806', border: '1px solid var(--border)', padding: '4px 10px', textAlign: 'center' }}>
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: 'var(--gold)', lineHeight: 1 }}>{memberCount}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginLeft: '5px' }}>Seats</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>Members</div>
                )
              })()}
              {members === null ? (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '16px' }}>Loading…</div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  {members.map((member, i) => {
                    const memberUserId = member.userId?._id ?? member.userId
                    const memberName   = member.userId?.name  ?? String(memberUserId)
                    const memberEmail  = member.userId?.email ?? ''
                    const isOwner      = member.role === 'owner'
                    return (
                      <div key={memberUserId ?? i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberName}</div>
                          {memberEmail && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)' }}>{memberEmail}</div>}
                        </div>
                        {isOwner ? (
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--gold)', letterSpacing: '1px', textTransform: 'uppercase' }}>owner</span>
                        ) : (
                          <>
                            <select
                              value={member.role}
                              onChange={async e => {
                                try {
                                  await workspacesApi.updateMember(activeWorkspace, memberUserId, { role: e.target.value })
                                  await loadWorkspace()
                                } catch (err) { setMsg(err.message) }
                              }}
                              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '4px 6px', cursor: 'pointer' }}
                            >
                              <option value="admin">admin</option>
                              <option value="member">member</option>
                            </select>
                            <button
                              onClick={async () => {
                                try {
                                  await workspacesApi.removeMember(activeWorkspace, memberUserId)
                                  await loadWorkspace()
                                } catch (err) { setMsg(err.message) }
                              }}
                              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '4px 10px', background: 'transparent', border: '1px solid #804040', color: '#f08080', cursor: 'pointer' }}
                            >Remove</button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Invite row */}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Invite Member</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  aria-label="Invite member by email"
                  style={{ flex: 1, background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '9px 12px', outline: 'none' }}
                />
                <button
                  onClick={async () => {
                    try {
                      const res = await workspacesApi.invite(activeWorkspace, { email: inviteEmail, role: 'member' })
                      setMsg(res.message)
                      setInviteEmail('')
                    } catch (err) {
                      if (err.code === 'seat_limit' || err.status === 402) {
                        setMsg('Upgrade to a paid plan to add team members — use the Upgrade buttons above.')
                      } else {
                        setMsg(err.message)
                      }
                    }
                  }}
                  style={btn(false)}
                >Invite</button>
              </div>

              {/* Create organization workspace row */}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Create Organization</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  aria-label="New organization workspace name"
                  style={{ flex: 1, background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '9px 12px', outline: 'none' }}
                />
                <button
                  onClick={async () => {
                    try {
                      await workspacesApi.create({ name: newWsName })
                      setMsg('Workspace created')
                      setNewWsName('')
                      await loadWorkspace()
                    } catch (err) { setMsg(err.message) }
                  }}
                  style={btn(false)}
                >Create</button>
              </div>
            </div>
          )}

          {tab === 'analytics' && analyticsData && (
            <div>
              {/* ── Summary tiles ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                  ['Series Generated', analyticsData.stats.totalSeries ?? 0],
                  ['Images', analyticsData.stats.totalImages ?? 0],
                  ['Videos', analyticsData.stats.totalVideos ?? 0],
                  ['Voice Lines', analyticsData.stats.totalVoice ?? 0],
                  ['Total Spent', `$${(analyticsData.stats.totalCost ?? 0).toFixed(3)}`],
                  ['Total Series (all time)', analyticsData.seriesCount],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: 'var(--gold)' }}>{value}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '4px' }}>{label}</div>
                  </div>
                ))}
              </div>
              <a href={analyticsApi.exportCSV()} download style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--gold)', textDecoration: 'underline' }}>
                ⬇ Export CSV
              </a>

              {/* ── Daily history ── */}
              {historyData && historyData.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>Daily Breakdown (last 30 days)</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Daily usage breakdown">
                      <thead>
                        <tr>
                          {['Date', 'Images', 'Videos', 'Voice', 'Cost'].map(h => (
                            <th key={h} scope="col" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: h === 'Date' ? 'left' : 'right', fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map(row => (
                          <tr key={row._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--cream)', padding: '6px 8px' }}>{row._id}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px', textAlign: 'right' }}>{row.images ?? 0}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px', textAlign: 'right' }}>{row.videos ?? 0}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px', textAlign: 'right' }}>{row.voice ?? 0}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', padding: '6px 8px', textAlign: 'right' }}>${(row.cost ?? 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {historyData && historyData.length === 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '16px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>No daily history in the last 30 days.</div>
              )}

              {/* ── Provider breakdown ── */}
              {providersData && providersData.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>Provider Usage</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Provider usage breakdown">
                      <thead>
                        <tr>
                          {['Action', 'Provider', 'Count', 'Total Cost', 'Success %'].map(h => (
                            <th key={h} scope="col" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: h === 'Action' || h === 'Provider' ? 'left' : 'right', fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {providersData.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--cream)', padding: '6px 8px' }}>{row._id?.action ?? '—'}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px' }}>{row._id?.provider ?? '—'}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px', textAlign: 'right' }}>{row.count}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', padding: '6px 8px', textAlign: 'right' }}>${(row.totalCost ?? 0).toFixed(4)}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: row.successRate >= 0.9 ? '#6dc87a' : '#f0a050', padding: '6px 8px', textAlign: 'right' }}>{((row.successRate ?? 0) * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Recent Jobs ── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>Recent Jobs</div>
                  <button
                    onClick={loadJobs}
                    disabled={jobsLoading}
                    aria-label="Refresh jobs list"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '3px 8px', cursor: jobsLoading ? 'not-allowed' : 'pointer', letterSpacing: '1px' }}
                  >{jobsLoading ? '…' : '↻ Refresh'}</button>
                </div>
                {jobsData === null ? (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>Loading…</div>
                ) : jobsData.length === 0 ? (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>No managed jobs yet.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Recent managed generation jobs">
                      <thead>
                        <tr>
                          {['Type', 'Tier', 'Status', 'Created', 'Cost'].map(h => (
                            <th key={h} scope="col" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: h === 'Type' || h === 'Tier' ? 'left' : 'right', fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {jobsData.map(job => {
                          const statusColor = job.status === 'done' ? '#6dc87a' : job.status === 'failed' ? '#f08080' : job.status === 'active' ? '#f0c040' : 'var(--muted)'
                          return (
                            <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--cream)', padding: '6px 8px' }}>{job.type}</td>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', padding: '6px 8px' }}>{job.tier}</td>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: statusColor, padding: '6px 8px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '1px' }}>{job.status}</td>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', padding: '6px 8px', textAlign: 'right' }}>{job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', padding: '6px 8px', textAlign: 'right' }}>{job.costUsd != null ? `$${job.costUsd.toFixed(4)}` : '—'}</td>
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
            <DistributionPanel onMsg={setMsg} />
          )}

          {tab === 'admin' && isAdmin && (
            <AdminPanel onMsg={setMsg} />
          )}
        </div>
      </div>
    </div>
  )
}

ProfilePage.propTypes = { onClose: PropTypes.func.isRequired }

function Field({ label, value, onChange, disabled }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '5px' }}>{label}</div>
      <input type="text" value={value || ''} onChange={onChange ? e => onChange(e.target.value) : undefined} disabled={disabled}
        style={{ width: '100%', background: disabled ? 'var(--surface2)' : '#0a0806', border: `1px solid ${disabled ? 'var(--border)' : 'var(--border)'}`, color: disabled ? 'var(--muted)' : 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '9px 12px', outline: 'none', boxSizing: 'border-box', cursor: disabled ? 'default' : 'text' }} />
    </div>
  )
}
Field.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string, onChange: PropTypes.func, disabled: PropTypes.bool }

function PasswordChanger({ onMsg }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!current || !next) return onMsg('Both fields required')
    if (next.length < 8) return onMsg('New password min 8 chars')
    setLoading(true)
    try { await usersApi.changePass({ currentPassword: current, newPassword: next }); onMsg('Password changed'); setCurrent(''); setNext('') }
    catch (err) { onMsg(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} aria-label="Current password" style={{ display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '10px 12px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }} />
      <input type="password" placeholder="New password (min 8 chars)" value={next} onChange={e => setNext(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} aria-label="New password (minimum 8 characters)" style={{ display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '10px 12px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
      <button onClick={save} disabled={loading} style={btn(loading)}>{loading ? 'Saving…' : 'Change Password'}</button>
    </div>
  )
}
PasswordChanger.propTypes = { onMsg: PropTypes.func.isRequired }

const btn = (disabled) => ({ background: disabled ? 'var(--border)' : 'var(--gold)', color: disabled ? 'var(--muted)' : '#080b10', border: 'none', padding: '10px 20px', fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer' })
