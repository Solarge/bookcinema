// Centralised API client — auto-refreshes JWT, attaches auth header
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let _accessToken = null

export function setAccessToken(token) { _accessToken = token }
export function getAccessToken()      { return _accessToken }
export function clearAccessToken()    { _accessToken = null }

let _workspaceId = null
export function setActiveWorkspace(id) { _workspaceId = id }
export function getActiveWorkspace()   { return _workspaceId }

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`
  if (_workspaceId) headers['X-Workspace-Id'] = _workspaceId

  let res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })

  // Auto-refresh on 401
  if (res.status === 401 && _accessToken) {
    const refreshRes = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (refreshRes.ok) {
      const { accessToken } = await refreshRes.json()
      setAccessToken(accessToken)
      headers['Authorization'] = `Bearer ${accessToken}`
      res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })
    } else {
      clearAccessToken()
      window.dispatchEvent(new Event('auth:logout'))
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const err = new Error(body.error || `Request failed: ${res.status}`)
    if (body.code)          err.code         = body.code
    if (body.feature)       err.feature      = body.feature
    if (body.requiredPlan)  err.requiredPlan  = body.requiredPlan
    err.status = res.status
    throw err
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return null
  return res.json()
}

const get  = (path, opts)   => request(path, { ...opts, method: 'GET' })
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body: JSON.stringify(body) })
const put  = (path, body, opts) => request(path, { ...opts, method: 'PUT',  body: JSON.stringify(body) })
const patch= (path, body, opts) => request(path, { ...opts, method: 'PATCH',body: JSON.stringify(body) })
const del  = (path, opts)   => request(path, { ...opts, method: 'DELETE' })

// ── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  register: (data)    => post('/api/auth/register', data),
  // login accepts an optional totp field for the 2FA step-up
  login:    (data)    => post('/api/auth/login', data),
  logout:   ()        => post('/api/auth/logout', {}),
  refresh:  ()        => post('/api/auth/refresh', {}),
  forgotPassword: (email) => post('/api/auth/forgot-password', { email }),
  resetPassword:  (token, password) => post('/api/auth/reset-password', { token, password }),
  verifyEmail:         (token) => get('/api/auth/verify-email?token=' + encodeURIComponent(token)),
  resendVerification:  ()      => post('/api/auth/resend-verification', {}),
}

// ── Series ────────────────────────────────────────────────────────────────────
export const series = {
  list:       (params)    => get(`/api/series?${new URLSearchParams(params)}`),
  get:        (id)        => get(`/api/series/${id}`),
  create:     (data)      => post('/api/series', data),
  update:     (id, data)  => put(`/api/series/${id}`, data),
  delete:     (id)        => del(`/api/series/${id}`),
  duplicate:  (id)        => post(`/api/series/${id}/duplicate`, {}),
  share:      (id)        => post(`/api/series/${id}/share`, {}),
  unshare:    (id)        => del(`/api/series/${id}/share`),
  getPublic:  (token)     => get(`/api/share/${token}`),
}

// Public share fetch — plain fetch with NO auth headers, works for logged-out visitors.
export async function getPublicShare(token) {
  const res = await fetch(`${BASE}/api/share/${encodeURIComponent(token)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const err = new Error(body.error || `Request failed: ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// ── Assets ────────────────────────────────────────────────────────────────────
export const assets = {
  list: (seriesId) => get(`/api/assets/${seriesId}`),
  // Persist a completed managed-generation job's result as an Asset (server references
  // the existing S3 object — no re-upload). { jobId, assetKey, provider?, quality?, aspectRatio?, prompt? }
  fromJob: (seriesId, data) => post(`/api/assets/${seriesId}/from-job`, data),
  uploadImage: (seriesId, formData) => request(`/api/assets/${seriesId}/image`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  uploadVideo: (seriesId, formData) => request(`/api/assets/${seriesId}/video`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  uploadAudio: (seriesId, formData) => request(`/api/assets/${seriesId}/audio`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  setApproval: (id, status) => patch(`/api/assets/${id}/approval`, { status }),
  delete:      (id)         => del(`/api/assets/${id}`),
}

// ── Workspaces ──────────────────────────────────────────────────────────────
export const workspaces = {
  list:          ()           => get('/api/workspaces'),
  switch:        (workspaceId)=> post('/api/workspaces/switch', { workspaceId }),
  members:       (id)         => get(`/api/workspaces/${id}/members`),
  create:        (data)       => post('/api/workspaces', data),
  update:        (id, data)   => put(`/api/workspaces/${id}`, data),
  invite:        (id, data)   => post(`/api/workspaces/${id}/invite`, data),
  acceptInvite:  (token)      => post('/api/workspaces/accept-invite', { token }),
  updateMember:  (id, uid, data) => patch(`/api/workspaces/${id}/members/${uid}`, data),
  removeMember:  (id, uid)    => del(`/api/workspaces/${id}/members/${uid}`),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  me:            ()     => get('/api/users/me'),
  update:        (data) => put('/api/users/me', data),
  changePass:    (data) => put('/api/users/me/password', data),
  getApiKey:     ()     => get('/api/users/me/api-key'),
  generateKey:   ()     => post('/api/users/me/api-key', {}),
  revokeKey:     ()     => del('/api/users/me/api-key'),
  exportData:    ()     => get('/api/users/me/export'),
  deleteAccount: ()     => del('/api/users/me'),
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analytics = {
  summary:   (days = 30) => get(`/api/analytics?days=${days}`),
  history:   (days = 30) => get(`/api/analytics/history?days=${days}`),
  providers: ()          => get('/api/analytics/providers'),
  exportCSV: ()          => `${BASE}/api/analytics/export.csv`,
}

// ── Managed generation ──────────────────────────────────────────────────────
export const managed = {
  generateText:    (data) => post('/api/generate/text',    data), // { bookText, genrePreset, language, tier, episodeCount? } -> { jobId }
  generateImage:   (data) => post('/api/generate/image',   data), // { prompt, aspectRatio, tier } -> { jobId }
  generateVoice:   (data) => post('/api/generate/voice',   data), // { text, voiceId, tier } -> { jobId }
  generateVideo:   (data) => post('/api/generate/video',   data), // { prompt, aspectRatio, duration, tier } -> { jobId }
  compileEpisode:  (data) => post('/api/generate/compile', data), // { seriesId, episodeNumber, clips: [url,...] } -> { jobId }
  getJob:          (id)   => get(`/api/jobs/${id}`),
  listJobs:        ()     => get('/api/jobs'),
}

// Poll a job until it reaches a terminal state (done|failed) or times out.
export async function pollJob(jobId, { intervalMs = 2000, timeoutMs = 180000, onUpdate } = {}) {
  const start = Date.now()
  for (;;) {
    const job = await managed.getJob(jobId)
    if (onUpdate) onUpdate(job)
    if (job.status === 'done' || job.status === 'failed') return job
    if (Date.now() - start > timeoutMs) throw new Error('Generation timed out')
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

// ── Billing ─────────────────────────────────────────────────────────────────
export const billing = {
  checkout: (data) => post('/api/billing/checkout', data), // { kind, key } -> { url }
  portal:   ()     => get('/api/billing/portal'),          // -> { url }
}

// ── Social Distribution ───────────────────────────────────────────────────────
export const social = {
  providers:  ()         => get('/api/social/providers'),
  connect:    (platform) => get(`/api/social/${platform}/connect`),
  accounts:   ()         => get('/api/social/accounts'),
  disconnect: (id)       => del(`/api/social/accounts/${id}`),
  createPost: (data)     => post('/api/social/posts', data),
  posts:      ()         => get('/api/social/posts'),
  cancelPost: (id)       => del(`/api/social/posts/${id}`),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  users:                 (p)              => get(`/api/admin/users?${new URLSearchParams(p)}`),
  setCredits:            (id, c, op)      => patch(`/api/admin/users/${id}/credits`, { credits: c, operation: op }),
  setPlan:               (id, data)       => patch(`/api/admin/users/${id}/plan`, data),
  deactivate:            (id)             => patch(`/api/admin/users/${id}/deactivate`, {}),
  stats:                 ()               => get('/api/admin/stats'),
  grantWorkspaceCredits: (id, amount, note) => patch(`/api/admin/workspaces/${id}/credits`, { amount, note }),
  setManagedAccess:      (id, enabled)       => patch(`/api/admin/workspaces/${id}/managed`, { enabled }),
  workspaces:            (search)            => get(`/api/admin/workspaces${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  jobs:                  (params = {})       => get(`/api/admin/jobs?${new URLSearchParams(params)}`),
  config:                ()                  => get('/api/admin/config'),
  funnel:                (days = 30)         => get(`/api/admin/funnel?days=${days}`),
  // 2FA management (admin accounts only)
  setup2fa:   ()        => post('/api/admin/2fa/setup', {}),
  enable2fa:  (token)   => post('/api/admin/2fa/enable', { token }),
  disable2fa: (token)   => post('/api/admin/2fa/disable', { token }),
}
