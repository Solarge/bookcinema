import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import userRoutes from '../routes/users.js'
import User from '../models/User.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function authApp() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.use('/api/auth', authRoutes)
  return a
}

function userApp() {
  const a = express()
  a.use(express.json())
  a.use('/api/users', userRoutes)
  return a
}

const bearer = (req, token) => req.set('Authorization', `Bearer ${token}`)

// ── Password policy ───────────────────────────────────────────────────────────

test('register rejects password shorter than 12 chars', async () => {
  const res = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'A', email: 'a@x.com', password: 'tooshort', consent: true })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('12'))
})

test('register accepts a 12-char password', async () => {
  const res = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'A', email: 'a@x.com', password: 'password1234', consent: true })
  assert.equal(res.status, 201)
})

test('register requires consent', async () => {
  const res = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'A', email: 'a@x.com', password: 'password1234' })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.toLowerCase().includes('consent') || res.body.error.toLowerCase().includes('terms'))
})

test('change-password rejects new password shorter than 12 chars', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(userApp()).put('/api/users/me/password'), token)
    .send({ currentPassword: 'password1234', newPassword: 'short' })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.includes('12'))
})

// ── Login lockout ─────────────────────────────────────────────────────────────

test('10 failed login attempts lock the account (423)', async () => {
  await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'U', email: 'lockout@x.com', password: 'password1234', consent: true })

  for (let i = 0; i < 10; i++) {
    await request(authApp())
      .post('/api/auth/login')
      .send({ email: 'lockout@x.com', password: 'wrongpassword1' })
  }

  const res = await request(authApp())
    .post('/api/auth/login')
    .send({ email: 'lockout@x.com', password: 'password1234' })
  assert.equal(res.status, 423)
  assert.ok(res.body.error.toLowerCase().includes('locked'))
})

test('successful login resets the failed attempt counter', async () => {
  await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'U', email: 'reset@x.com', password: 'password1234', consent: true })

  // 5 bad attempts
  for (let i = 0; i < 5; i++) {
    await request(authApp())
      .post('/api/auth/login')
      .send({ email: 'reset@x.com', password: 'wrongpassword1' })
  }
  // correct login should succeed (not yet locked)
  const ok = await request(authApp())
    .post('/api/auth/login')
    .send({ email: 'reset@x.com', password: 'password1234' })
  assert.equal(ok.status, 200)

  // failedLoginAttempts should be reset
  const user = await User.findOne({ email: 'reset@x.com' })
  assert.equal(user.failedLoginAttempts, 0)
  assert.equal(user.lockedUntil, null)
})

// ── Email verification ────────────────────────────────────────────────────────

test('register sets emailVerifiedAt to null', async () => {
  await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'V', email: 'verify@x.com', password: 'password1234', consent: true })
  const user = await User.findOne({ email: 'verify@x.com' })
  assert.equal(user.emailVerifiedAt, null)
})

test('GET /verify-email with valid token sets emailVerifiedAt', async () => {
  await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'V', email: 'verify2@x.com', password: 'password1234', consent: true })
  const user = await User.findOne({ email: 'verify2@x.com' })
  assert.equal(user.emailVerifiedAt, null)

  // Generate the same type of token the register route would send
  const token = signAccess({ userId: user._id.toString(), purpose: 'verify_email' })
  const res = await request(authApp())
    .get(`/api/auth/verify-email?token=${token}`)
    .set('Accept', 'application/json')
  assert.equal(res.status, 200)
  assert.ok(res.body.message)

  const updated = await User.findById(user._id)
  assert.ok(updated.emailVerifiedAt, 'emailVerifiedAt should be set')
})

test('GET /verify-email with invalid token returns 400', async () => {
  const res = await request(authApp())
    .get('/api/auth/verify-email?token=notavalidtoken')
    .set('Accept', 'application/json')
  assert.equal(res.status, 400)
})

test('GET /verify-email with wrong purpose returns 400', async () => {
  const user = await User.create({ name: 'X', email: 'x@x.com', password: 'password1234' })
  const token = signAccess({ userId: user._id.toString(), purpose: 'wrong_purpose' })
  const res = await request(authApp())
    .get(`/api/auth/verify-email?token=${token}`)
    .set('Accept', 'application/json')
  assert.equal(res.status, 400)
})

// ── managedAccess email_unverified gate ───────────────────────────────────────

test('managedAccess 403 email_unverified for non-admin unverified user', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const req = {
    workspace: { _id: wsId, managedBeta: true },
    user: { _id: new mongoose.Types.ObjectId(), role: 'user', emailVerifiedAt: null },
    body: {}, params: {},
  }
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
  await managedAccess('text')(req, res, () => {})
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.code, 'email_unverified')
})

test('managedAccess passes for admin even without emailVerifiedAt', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const req = {
    workspace: { _id: wsId, managedBeta: true },
    user: { _id: new mongoose.Types.ObjectId(), role: 'admin', emailVerifiedAt: null },
    body: {}, params: {},
  }
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
  let nexted = false
  await managedAccess('text')(req, res, () => { nexted = true })
  assert.equal(nexted, true)
})

test('managedAccess passes for verified non-admin user', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const req = {
    workspace: { _id: wsId, managedBeta: true },
    user: { _id: new mongoose.Types.ObjectId(), role: 'user', emailVerifiedAt: new Date() },
    body: {}, params: {},
  }
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
  let nexted = false
  await managedAccess('text')(req, res, () => { nexted = true })
  assert.equal(nexted, true)
})

// ── Refresh token rotation ────────────────────────────────────────────────────

test('POST /refresh issues a new access token and rotates the refresh cookie', async () => {
  // Register to get a refresh cookie
  const registerRes = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'R', email: 'rotation@x.com', password: 'password1234', consent: true })
  assert.equal(registerRes.status, 201)

  const cookie = registerRes.headers['set-cookie']?.[0]
  assert.ok(cookie, 'should set a cookie on register')

  // Extract the refresh token value from the cookie header
  const oldRefreshMatch = cookie.match(/refreshToken=([^;]+)/)
  assert.ok(oldRefreshMatch, 'refreshToken cookie should be present')
  const oldRefreshToken = oldRefreshMatch[1]

  // The old token should have a jti
  const oldPayload = verifyRefresh(oldRefreshToken)
  assert.ok(oldPayload.jti, 'refresh token should have a jti')

  // Call /refresh with the old cookie
  const refreshRes = await request(authApp())
    .post('/api/auth/refresh')
    .set('Cookie', `refreshToken=${oldRefreshToken}`)
  assert.equal(refreshRes.status, 200)
  assert.ok(refreshRes.body.accessToken, 'should return new accessToken')

  // A new refresh cookie should be set
  const newCookie = refreshRes.headers['set-cookie']?.[0]
  assert.ok(newCookie, 'should set a new refresh cookie')
  const newRefreshMatch = newCookie.match(/refreshToken=([^;]+)/)
  assert.ok(newRefreshMatch, 'new refreshToken cookie should be present')
  const newRefreshToken = newRefreshMatch[1]

  // New token should have a different jti
  const newPayload = verifyRefresh(newRefreshToken)
  assert.ok(newPayload.jti, 'new refresh token should have a jti')
  assert.notEqual(newPayload.jti, oldPayload.jti, 'jti should rotate on each refresh')
})

test('signRefresh embeds a unique jti in every token', () => {
  // Without Redis we cannot test the blacklist itself, but we can assert jti is present
  const t1 = signRefresh({ userId: 'u1' })
  const t2 = signRefresh({ userId: 'u1' })
  const p1 = verifyRefresh(t1)
  const p2 = verifyRefresh(t2)
  assert.ok(p1.jti, 'token 1 has jti')
  assert.ok(p2.jti, 'token 2 has jti')
  assert.notEqual(p1.jti, p2.jti, 'each token has a unique jti')
})

// ── Preferences validation ─────────────────────────────────────────────────────

test('PUT /me unknown preference keys are dropped (not stored)', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(userApp()).put('/api/users/me'), token)
    .send({ preferences: { language: 'fr', unknownKey: 'malicious' } })
  assert.equal(res.status, 200)
  assert.equal(res.body.preferences.language, 'fr')
  assert.equal(res.body.preferences.unknownKey, undefined)
})

test('PUT /me __proto__ key in preferences returns 400', async () => {
  const { token } = await makeAuthedUser()
  // Use a parsed body to avoid JSON parse stripping __proto__
  const res = await bearer(request(userApp()).put('/api/users/me'), token)
    .set('Content-Type', 'application/json')
    .send('{"preferences":{"__proto__":{"admin":true}}}')
  assert.equal(res.status, 400)
})

test('PUT /me rejects preferences payload over 50 KB', async () => {
  const { token } = await makeAuthedUser()
  // Build a large string that exceeds 50 KB when JSON-stringified
  const huge = { language: 'x'.repeat(60_000) }
  const res = await bearer(request(userApp()).put('/api/users/me'), token)
    .send({ preferences: huge })
  assert.equal(res.status, 400)
  assert.ok(res.body.error.toLowerCase().includes('large') || res.body.error.toLowerCase().includes('50'))
})

test('PUT /me known preference keys are stored', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(userApp()).put('/api/users/me'), token)
    .send({ preferences: { theme: 'dark', notifications: true, defaultTextProvider: 'groq' } })
  assert.equal(res.status, 200)
  assert.equal(res.body.preferences.theme, 'dark')
  assert.equal(res.body.preferences.notifications, true)
  assert.equal(res.body.preferences.defaultTextProvider, 'groq')
})
