// admin-2fa.test.js
// Tests for TOTP 2FA: setup, enable, disable, login step-up, and access guard.
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import adminRoutes from '../routes/admin.js'
import authRoutes from '../routes/auth.js'
import User from '../models/User.js'
import { signAccess } from '../utils/jwt.js'
import { decryptToken } from '../utils/cryptoTokens.js'
import { authenticator } from 'otplib'

// SOCIAL_TOKEN_KEY must be set so cryptoTokens.js can encrypt/decrypt
process.env.SOCIAL_TOKEN_KEY ||= 'test_social_token_key_for_2fa_tests_32x'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function adminApp() {
  const a = express()
  a.use(express.json())
  a.use('/api/admin', adminRoutes)
  return a
}

function authApp() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.use('/api/auth', authRoutes)
  return a
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeAdmin() {
  const u = await User.create({
    name: 'Admin', email: `admin${Math.random()}@x.com`,
    password: 'AdminPass1234!', role: 'admin',
  })
  const token = signAccess({ userId: u._id, email: u.email, role: u.role })
  return { user: u, token }
}

async function makeUser() {
  const u = await User.create({
    name: 'User', email: `user${Math.random()}@x.com`,
    password: 'UserPass1234!', role: 'user',
  })
  const token = signAccess({ userId: u._id, email: u.email, role: u.role })
  return { user: u, token }
}

// ── 1. Setup returns otpauthUrl + secret; stored secret is encrypted ──────────

test('POST /2fa/setup returns otpauthUrl and secret, stores encrypted secret', async () => {
  const { token } = await makeAdmin()
  const res = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok(typeof res.body.otpauthUrl === 'string', 'otpauthUrl present')
  assert.ok(typeof res.body.secret === 'string', 'secret present')
  assert.ok(res.body.otpauthUrl.startsWith('otpauth://totp/'), 'valid otpauth URL')
  assert.ok(res.body.secret.length >= 16, 'secret has reasonable length')

  // totpEnabled should still be false after setup
  const { user } = await makeAdmin() // re-fetch by re-making — but we need the one we just set up
  // Reload from DB using select(+totpSecretEnc)
  const uid = (await User.findOne({ role: 'admin' }))._id
  const dbUser = await User.findById(uid).select('+totpSecretEnc')
  assert.ok(dbUser.totpSecretEnc, 'totpSecretEnc stored')
  assert.notEqual(dbUser.totpSecretEnc, res.body.secret, 'stored value is encrypted (not raw secret)')
  assert.equal(dbUser.totpEnabled, false, 'totpEnabled still false after setup')

  // Decrypt and verify it matches the returned secret
  const decrypted = decryptToken(dbUser.totpSecretEnc)
  assert.equal(decrypted, res.body.secret, 'decrypted secret matches returned secret')
})

// ── 2. Enable with valid token → totpEnabled true ────────────────────────────

test('POST /2fa/enable with valid TOTP token sets totpEnabled=true', async () => {
  const { user, token } = await makeAdmin()

  // First, setup
  const setupRes = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(setupRes.status, 200)
  const { secret } = setupRes.body

  // Generate a valid TOTP code
  const totpCode = authenticator.generate(secret)

  const enableRes = await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: totpCode })
  assert.equal(enableRes.status, 200)
  assert.equal(enableRes.body.totpEnabled, true)

  // Confirm DB state
  const dbUser = await User.findById(user._id)
  assert.equal(dbUser.totpEnabled, true)
})

// ── 3. Enable with invalid token → 400 ────────────────────────────────────────

test('POST /2fa/enable with invalid TOTP code returns 400', async () => {
  const { token } = await makeAdmin()

  // Setup first
  await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)

  const res = await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: '000000' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /invalid/i)
})

// ── 4. Login: 2FA-enabled admin without totp → 401 2fa_required ───────────────

test('login with correct password but no TOTP returns 401 code:2fa_required', async () => {
  const { user, token } = await makeAdmin()

  // Setup + enable 2FA
  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const code = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: code })

  // Attempt login with just password
  const res = await request(authApp())
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1234!' })
  assert.equal(res.status, 401)
  assert.equal(res.body.code, '2fa_required')
  assert.ok(!res.body.accessToken, 'no token issued')
})

// ── 5. Login: 2FA-enabled admin with wrong totp → 401 2fa_invalid ─────────────

test('login with correct password but wrong TOTP returns 401 code:2fa_invalid', async () => {
  const { user, token } = await makeAdmin()

  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const code = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: code })

  const res = await request(authApp())
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1234!', totp: '000000' })
  assert.equal(res.status, 401)
  assert.equal(res.body.code, '2fa_invalid')
  assert.ok(!res.body.accessToken, 'no token issued')
})

// ── 6. Login: 2FA-enabled admin with correct totp → 200 + token ───────────────

test('login with correct password and correct TOTP returns 200 with accessToken', async () => {
  const { user, token } = await makeAdmin()

  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const enableCode = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: enableCode })

  // Generate a fresh code for login (same second = same code, acceptable in tests)
  const loginCode = authenticator.generate(secret)

  const res = await request(authApp())
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1234!', totp: loginCode })
  assert.equal(res.status, 200)
  assert.ok(res.body.accessToken, 'access token issued')
  assert.ok(res.body.user, 'user object returned')
  assert.equal(res.body.user.totpEnabled, true)
})

// ── 7. Non-2FA user logs in normally (no change in behaviour) ─────────────────

test('non-2FA user logs in normally without providing totp', async () => {
  const u = await User.create({
    name: 'Regular', email: 'regular@x.com', password: 'RegularPass1234!', role: 'user',
  })
  const res = await request(authApp())
    .post('/api/auth/login')
    .send({ email: u.email, password: 'RegularPass1234!' })
  assert.equal(res.status, 200)
  assert.ok(res.body.accessToken, 'token issued for non-2FA user')
})

// ── 8. 2FA failure must NOT increment failedLoginAttempts ────────────────────

test('wrong TOTP code does not increment failedLoginAttempts', async () => {
  const { user, token } = await makeAdmin()

  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const code = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: code })

  // Bad TOTP
  await request(authApp())
    .post('/api/auth/login')
    .send({ email: user.email, password: 'AdminPass1234!', totp: '000000' })

  const dbUser = await User.findById(user._id)
  assert.equal(dbUser.failedLoginAttempts, 0, 'failedLoginAttempts not incremented on 2FA failure')
})

// ── 9. Disable with valid token → totpEnabled false, secret cleared ───────────

test('POST /2fa/disable with valid token clears 2FA', async () => {
  const { user, token } = await makeAdmin()

  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const enableCode = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: enableCode })

  // Disable
  const disableCode = authenticator.generate(secret)
  const res = await request(adminApp())
    .post('/api/admin/2fa/disable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: disableCode })
  assert.equal(res.status, 200)
  assert.equal(res.body.totpEnabled, false)

  const dbUser = await User.findById(user._id).select('+totpSecretEnc')
  assert.equal(dbUser.totpEnabled, false)
  assert.equal(dbUser.totpSecretEnc, null)
})

// ── 10. Disable with wrong code → 400 ────────────────────────────────────────

test('POST /2fa/disable with invalid token returns 400', async () => {
  const { token } = await makeAdmin()

  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const code = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: code })

  const res = await request(adminApp())
    .post('/api/admin/2fa/disable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: '000000' })
  assert.equal(res.status, 400)
})

// ── 11. Non-admin cannot hit the /2fa endpoints (403) ─────────────────────────

test('non-admin user gets 403 on /2fa/setup', async () => {
  const { token } = await makeUser()
  const res = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
})

test('non-admin user gets 403 on /2fa/enable', async () => {
  const { token } = await makeUser()
  const res = await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: '123456' })
  assert.equal(res.status, 403)
})

test('non-admin user gets 403 on /2fa/disable', async () => {
  const { token } = await makeUser()
  const res = await request(adminApp())
    .post('/api/admin/2fa/disable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: '123456' })
  assert.equal(res.status, 403)
})

// ── 12. toSafeObject never leaks totpSecretEnc ────────────────────────────────

test('toSafeObject never exposes totpSecretEnc', async () => {
  const { user, token } = await makeAdmin()
  const { body: { secret } } = await request(adminApp())
    .post('/api/admin/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
  const code = authenticator.generate(secret)
  await request(adminApp())
    .post('/api/admin/2fa/enable')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: code })

  const dbUser = await User.findById(user._id).select('+totpSecretEnc')
  const safe = dbUser.toSafeObject()
  assert.ok(!('totpSecretEnc' in safe), 'totpSecretEnc not in toSafeObject output')
  assert.equal(safe.totpEnabled, true, 'totpEnabled is exposed in toSafeObject')
})
