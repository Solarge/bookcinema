// Set SOCIAL_TOKEN_KEY before any import that might pull in config or cryptoTokens.
process.env.SOCIAL_TOKEN_KEY = 'test-social-token-key-for-oauth-tests-xxxxx'

import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { makeAuthedUser } from './helpers/auth.js'
import { socialRouter } from '../routes/social.js'
import SocialAccount from '../models/SocialAccount.js'
import { decryptToken } from '../utils/cryptoTokens.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

// ---------------------------------------------------------------------------
// Fake provider registry
// ---------------------------------------------------------------------------

function makeFakeRegistry({ configured = true } = {}) {
  const fake = {
    meta:        { key: 'youtube', label: 'YouTube' },
    isConfigured: () => configured,
    getAuthUrl:  ({ state }) => `https://fake-provider.test/auth?state=${state}`,
    exchangeCode: async () => ({
      account: { externalId: 'ext1', displayName: 'My Channel', scopes: ['upload'] },
      tokens:  {
        accessToken:  'AT',
        refreshToken: 'RT',
        expiresAt:    new Date(Date.now() + 3600e3),
      },
    }),
  }

  // A second unconfigured provider for the 503 test
  const notConfigured = {
    meta:        { key: 'tiktok', label: 'TikTok' },
    isConfigured: () => false,
    getAuthUrl:  () => { throw new Error('not configured') },
    exchangeCode: async () => { throw new Error('not configured') },
  }

  const fakes = { youtube: fake, tiktok: notConfigured }

  return {
    getProvider: (k) => {
      if (!fakes[k]) throw new Error(`Unknown social platform: ${k}`)
      return fakes[k]
    },
    listConfigured: () => [
      { key: 'youtube',   label: 'YouTube',  configured: fake.isConfigured() },
      { key: 'tiktok',    label: 'TikTok',   configured: false },
      { key: 'instagram', label: 'Instagram', configured: false },
      { key: 'facebook',  label: 'Facebook',  configured: false },
      { key: 'x',         label: 'X',         configured: false },
      { key: 'linkedin',  label: 'LinkedIn',  configured: false },
    ],
  }
}

function buildApp(registry) {
  const a = express()
  a.use(express.json())
  a.use('/api/social', socialRouter)
  if (registry) a.locals.socialProviders = registry
  return a
}

const bearer = (req, token) => req.set('Authorization', `Bearer ${token}`)

// ---------------------------------------------------------------------------
// 1. GET /api/social/providers
// ---------------------------------------------------------------------------

test('providers list returns 6 entries with configured flags', async () => {
  const { token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const res = await bearer(request(buildApp(registry)).get('/api/social/providers'), token)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 6)
  const yt = res.body.find(e => e.key === 'youtube')
  assert.ok(yt, 'youtube entry present')
  assert.equal(yt.configured, true)
  const tk = res.body.find(e => e.key === 'tiktok')
  assert.equal(tk.configured, false)
  for (const entry of res.body) {
    assert.ok('key'        in entry, 'key present')
    assert.ok('label'      in entry, 'label present')
    assert.ok('configured' in entry, 'configured present')
  }
})

test('providers list 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry())).get('/api/social/providers')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 2. GET /api/social/:platform/connect
// ---------------------------------------------------------------------------

test('connect returns a url containing the state param', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const res = await bearer(
    request(buildApp(registry))
      .get('/api/social/youtube/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 200)
  assert.ok(res.body.url, 'url present')
  assert.ok(res.body.url.includes('state='), 'url contains state param')
  assert.ok(res.body.url.startsWith('https://fake-provider.test/auth'), 'url from fake provider')
})

test('connect 400 for unknown platform', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const res = await bearer(
    request(buildApp(registry))
      .get('/api/social/snapchat/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 400)
})

test('connect 503 when provider is not configured', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry({ configured: false })
  // tiktok is always unconfigured in the fake
  const res = await bearer(
    request(buildApp(registry))
      .get('/api/social/tiktok/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 503)
  assert.ok(res.body.error, 'error message present')
  assert.equal(res.body.code, 'not_configured')
})

test('connect 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry()))
    .get('/api/social/youtube/connect')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 3. GET /api/social/:platform/callback
// ---------------------------------------------------------------------------

/**
 * Obtain a valid state token by calling connect (which signs one internally),
 * then extract the `state=` query param from the returned URL.
 */
async function getValidStateFromConnect(app, workspace, token) {
  const res = await bearer(
    request(app)
      .get('/api/social/youtube/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 200, 'connect should succeed')
  const url = new URL(res.body.url)
  return url.searchParams.get('state')
}

test('callback with valid state creates a SocialAccount with encrypted tokens, redirects 302', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state = await getValidStateFromConnect(app, workspace, token)

  const res = await request(app)
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code-123', state })

  assert.equal(res.status, 302, 'should redirect 302')
  assert.ok(res.headers.location?.includes('social=connected'), 'redirect to client with social=connected')
  assert.ok(res.headers.location?.includes('platform=youtube'), 'redirect includes platform')

  // Verify the SocialAccount was created
  const accounts = await SocialAccount.find({ workspaceId: workspace._id })
  assert.equal(accounts.length, 1, 'one account created')
  const acct = accounts[0]
  assert.equal(acct.platform, 'youtube')
  assert.equal(acct.externalId, 'ext1')
  assert.equal(acct.displayName, 'My Channel')

  // Tokens must be encrypted (not stored as plaintext)
  assert.notEqual(acct.accessTokenEnc,  'AT', 'accessTokenEnc must not be plaintext')
  assert.notEqual(acct.refreshTokenEnc, 'RT', 'refreshTokenEnc must not be plaintext')

  // Tokens must decrypt correctly
  assert.equal(decryptToken(acct.accessTokenEnc),  'AT', 'accessToken decrypts correctly')
  assert.equal(decryptToken(acct.refreshTokenEnc), 'RT', 'refreshToken decrypts correctly')
})

test('callback with a garbage state token → 400', async () => {
  const registry = makeFakeRegistry()
  const res = await request(buildApp(registry))
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code', state: 'this.is.garbage' })
  assert.equal(res.status, 400)
})

test('callback with no state → 400', async () => {
  const registry = makeFakeRegistry()
  const res = await request(buildApp(registry))
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code' })
  assert.equal(res.status, 400)
})

test('callback with platform mismatch in state → 400', async () => {
  // Sign a state for tiktok but hit the youtube callback
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  // Get a tiktok state (will fail connect because tiktok is unconfigured — so
  // we sign one manually the same way the route does, using the same JWT secret)
  const { signState } = await getSignStateHelper()
  const tiktokState = signState({
    workspaceId: workspace._id.toString(),
    platform:    'tiktok',
    userId:      new mongoose.Types.ObjectId().toString(),
    purpose:     'social_oauth',
  })

  const res = await request(app)
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code', state: tiktokState })
  assert.equal(res.status, 400)
  assert.ok(/mismatch/i.test(res.body.error), 'error message mentions mismatch')
})

// Helper: access the same signState logic the route uses by importing jwt + config
async function getSignStateHelper() {
  const { default: jwt } = await import('jsonwebtoken')
  const { config } = await import('../config.js')
  return {
    signState: (payload) => jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' }),
  }
}

test('callback is idempotent — second call upserts, still one account', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state1 = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'code1', state: state1 })

  const state2 = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'code2', state: state2 })

  const count = await SocialAccount.countDocuments({ workspaceId: workspace._id })
  assert.equal(count, 1, 'upsert: still only one account after two callbacks')
})

// ---------------------------------------------------------------------------
// 4. GET /api/social/accounts
// ---------------------------------------------------------------------------

test('accounts list returns toClient() shape with no *Enc fields', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  // Connect once to create an account
  const state = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'c', state })

  const res = await bearer(
    request(app)
      .get('/api/social/accounts')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  const acct = res.body[0]
  assert.ok(acct.id,           'id present')
  assert.equal(acct.platform, 'youtube')
  assert.equal(acct.displayName, 'My Channel')
  assert.ok(!('accessTokenEnc'  in acct), 'accessTokenEnc absent from response')
  assert.ok(!('refreshTokenEnc' in acct), 'refreshTokenEnc absent from response')
})

test('accounts list is workspace-scoped — other workspace accounts not returned', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()

  // Plant an account in ws2 directly
  await SocialAccount.create({
    workspaceId:    ws2._id,
    platform:       'youtube',
    externalId:     'ext-other',
    displayName:    'Other workspace',
    accessTokenEnc: 'enc-placeholder',
    connectedBy:    new mongoose.Types.ObjectId(),
  })

  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const res = await bearer(
    request(app)
      .get('/api/social/accounts')
      .set('X-Workspace-Id', ws1._id.toString()),
    tok1,
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 0, 'ws1 should see zero accounts')
})

test('accounts list 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry())).get('/api/social/accounts')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 5. DELETE /api/social/accounts/:id
// ---------------------------------------------------------------------------

test('delete removes the account in the correct workspace', async () => {
  const { workspace, token } = await makeAuthedUser()
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'c', state })

  const accounts = await SocialAccount.find({ workspaceId: workspace._id })
  const id = accounts[0]._id.toString()

  const del = await bearer(
    request(app)
      .delete(`/api/social/accounts/${id}`)
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(del.status, 200)
  assert.equal(del.body.ok, true)

  const remaining = await SocialAccount.countDocuments({ workspaceId: workspace._id })
  assert.equal(remaining, 0, 'account removed from DB')
})

test('delete 404 for an account in a different workspace', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()

  // Create account in ws2
  const acct = await SocialAccount.create({
    workspaceId:    ws2._id,
    platform:       'youtube',
    externalId:     'ext-ws2',
    displayName:    'WS2 Channel',
    accessTokenEnc: 'enc-placeholder',
    connectedBy:    new mongoose.Types.ObjectId(),
  })

  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const res = await bearer(
    request(app)
      .delete(`/api/social/accounts/${acct._id}`)
      .set('X-Workspace-Id', ws1._id.toString()),
    tok1,
  )
  assert.equal(res.status, 404, 'cannot delete account from another workspace')
})

test('delete 401 without auth', async () => {
  const id = new mongoose.Types.ObjectId()
  const res = await request(buildApp(makeFakeRegistry()))
    .delete(`/api/social/accounts/${id}`)
  assert.equal(res.status, 401)
})
