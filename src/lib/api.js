// Centralised API client — auto-refreshes JWT, attaches auth header
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let _accessToken = null

export function setAccessToken(token) { _accessToken = token }
export function getAccessToken()      { return _accessToken }
export function clearAccessToken()    { _accessToken = null }

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

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
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Request failed: ${res.status}`)
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
  login:    (data)    => post('/api/auth/login', data),
  logout:   ()        => post('/api/auth/logout', {}),
  refresh:  ()        => post('/api/auth/refresh', {}),
  forgotPassword: (email) => post('/api/auth/forgot-password', { email }),
  resetPassword:  (token, password) => post('/api/auth/reset-password', { token, password }),
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

// ── Assets ────────────────────────────────────────────────────────────────────
export const assets = {
  list: (seriesId) => get(`/api/assets/${seriesId}`),
  uploadImage: (seriesId, formData) => request(`/api/assets/${seriesId}/image`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  uploadVideo: (seriesId, formData) => request(`/api/assets/${seriesId}/video`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  uploadAudio: (seriesId, formData) => request(`/api/assets/${seriesId}/audio`, { method: 'POST', body: formData, headers: { Authorization: _accessToken ? `Bearer ${_accessToken}` : undefined } }),
  setApproval: (id, status) => patch(`/api/assets/${id}/approval`, { status }),
  delete:      (id)         => del(`/api/assets/${id}`),
}

// ── Teams ─────────────────────────────────────────────────────────────────────
export const teams = {
  me:            ()           => get('/api/teams/me'),
  create:        (data)       => post('/api/teams', data),
  update:        (id, data)   => put(`/api/teams/${id}`, data),
  invite:        (id, data)   => post(`/api/teams/${id}/invite`, data),
  acceptInvite:  (token)      => post('/api/teams/accept-invite', { token }),
  updateMember:  (id, uid, data) => patch(`/api/teams/${id}/members/${uid}`, data),
  removeMember:  (id, uid)    => del(`/api/teams/${id}/members/${uid}`),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  me:           ()     => get('/api/users/me'),
  update:       (data) => put('/api/users/me', data),
  changePass:   (data) => put('/api/users/me/password', data),
  getApiKey:    ()     => get('/api/users/me/api-key'),
  generateKey:  ()     => post('/api/users/me/api-key', {}),
  revokeKey:    ()     => del('/api/users/me/api-key'),
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analytics = {
  summary:   (days = 30) => get(`/api/analytics?days=${days}`),
  history:   (days = 30) => get(`/api/analytics/history?days=${days}`),
  providers: ()          => get('/api/analytics/providers'),
  exportCSV: ()          => `${BASE}/api/analytics/export.csv`,
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  users:        (p)         => get(`/api/admin/users?${new URLSearchParams(p)}`),
  setCredits:   (id, c, op) => patch(`/api/admin/users/${id}/credits`, { credits: c, operation: op }),
  setPlan:      (id, data)  => patch(`/api/admin/users/${id}/plan`, data),
  deactivate:   (id)        => patch(`/api/admin/users/${id}/deactivate`, {}),
  stats:        ()          => get('/api/admin/stats'),
}
