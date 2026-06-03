import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../contexts/AuthContext'
import { users as usersApi, analytics as analyticsApi, workspaces as workspacesApi } from '../../lib/api'

export default function ProfilePage({ onClose }) {
  const { user, logout, updateUser, activeWorkspace } = useAuth()
  const [tab, setTab]               = useState('profile') // profile | security | apikey | analytics
  const [name, setName]             = useState(user?.name ?? '')
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')
  const [apiKeyData, setApiKeyData] = useState(null)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [members, setMembers]             = useState(null)
  const [wsList, setWsList]               = useState([])
  const [inviteEmail, setInviteEmail]     = useState('')
  const [newWsName, setNewWsName]         = useState('')

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
      const data = await analyticsApi.summary(30)
      setAnalyticsData(data)
    } catch (err) { setMsg(err.message) }
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

  const TABS = ['profile', 'security', 'apikey', 'workspace', 'analytics']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>
            ACCOUNT — {user?.name?.toUpperCase()}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={logout} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid #804040', color: '#f08080', cursor: 'pointer' }}>Sign Out</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'analytics') loadAnalytics(); if (t === 'workspace') loadWorkspace() }} style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: t === tab ? '2px solid var(--gold)' : '2px solid transparent',
              color: t === tab ? 'var(--gold)' : 'var(--muted)',
              padding: '10px 4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {msg && <div style={{ background: '#0a2010', border: '1px solid #3a7a4a', padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6dc87a', marginBottom: '16px' }}>{msg}</div>}

          {tab === 'profile' && (
            <div>
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={user?.email} disabled />
              <Field label="Plan" value={user?.plan} disabled />
              <Field label="Credits" value={String(user?.credits ?? 0)} disabled />
              <button onClick={saveProfile} disabled={saving} style={btn(saving)}>{saving ? 'Saving…' : 'Save Profile'}</button>
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
                  </div>
                ) : null
              })()}

              {/* Members list */}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>Members</div>
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
                  style={{ flex: 1, background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', padding: '9px 12px', outline: 'none' }}
                />
                <button
                  onClick={async () => {
                    try {
                      const res = await workspacesApi.invite(activeWorkspace, { email: inviteEmail, role: 'member' })
                      setMsg(res.message)
                      setInviteEmail('')
                    } catch (err) { setMsg(err.message) }
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
            </div>
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
      <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} style={{ display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '10px 12px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }} />
      <input type="password" placeholder="New password (min 8 chars)" value={next} onChange={e => setNext(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} style={{ display: 'block', width: '100%', background: '#0a0806', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '10px 12px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
      <button onClick={save} disabled={loading} style={btn(loading)}>{loading ? 'Saving…' : 'Change Password'}</button>
    </div>
  )
}
PasswordChanger.propTypes = { onMsg: PropTypes.func.isRequired }

const btn = (disabled) => ({ background: disabled ? 'var(--border)' : 'var(--gold)', color: disabled ? 'var(--muted)' : '#080b10', border: 'none', padding: '10px 20px', fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer' })
