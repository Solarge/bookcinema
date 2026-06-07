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
import SocialAppCredential from '../models/SocialAppCredential.js'
import { encryptToken, decryptToken } from '../utils/cryptoTokens.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

// ---------------------------------------------------------------------------
// Fake provider registry
// ---------------------------------------------------------------------------
//
// Per-workspace model: "configured" depends on stored SocialAppCredential rows,
// NOT on any provider flag. The fake registry therefore exposes credentialFields
// (so requiredKeys can be derived) and getAuthUrl/exchangeCode that consume creds.

const YT_FIELDS = [
  { key: 'client_id',     label: 'Client ID' },
  { key: 'client_secret', label: 'Client Secret', secret: true },
]

function makeFakeRegistry() {
  const fake = {
    meta:        { key: 'youtube', label: 'YouTube', credentialFields: YT_FIELDS },
    getAuthUrl:  ({ creds, state }) => `https://fake-provider.test/auth?client_id=${creds.client_id}&state=${state}`,
    exchangeCode: async ({ creds }) => {
      // Prove creds reached the provider.
      assert.ok(creds?.client_id, 'exchangeCode received creds.client_id')
      return {
        account: { externalId: 'ext1', displayName: 'My Channel', scopes: ['upload'] },
        tokens:  { accessToken: 'AT', refreshToken: 'RT', expiresAt: new Date(Date.now() + 3600e3) },
      }
    },
  }

  const tiktok = {
    meta:        { key: 'tiktok', label: 'TikTok', credentialFields: [
      { key: 'client_key',    label: 'Client Key' },
      { key: 'client_secret', label: 'Client Secret', secret: true },
    ] },
    getAuthUrl:  ({ creds, state }) => `https://fake-provider.test/tiktok?client_key=${creds.client_key}&state=${state}`,
    exchangeCode: async () => ({ account: { externalId: 'tk1', displayName: 'TK' }, tokens: { accessToken: 'A', refreshToken: 'R' } }),
  }

  const fakes = { youtube: fake, tiktok }

  return {
    getProvider: (k) => {
      if (!fakes[k]) throw new Error(`Unknown social platform: ${k}`)
      return fakes[k]
    },
    credentialFields: (k) => fakes[k]?.meta.credentialFields || [],
    requiredKeys:     (k) => (fakes[k]?.meta.credentialFields || []).map(f => f.key),
    listAll: () => Object.entries(fakes).map(([key, p]) => ({
      key, label: p.meta.label, credentialFields: p.meta.credentialFields,
    })),
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

/** Seed a workspace's own app credentials for a platform. */
async function seedCreds(workspaceId, platform = 'youtube', values = { client_id: 'CID', client_secret: 'CSEC' }) {
  return SocialAppCredential.create({
    workspaceId,
    platform,
    valuesEnc: encryptToken(JSON.stringify(values)),
  })
}

// ---------------------------------------------------------------------------
// 1. GET /api/social/providers — per-workspace configured
// ---------------------------------------------------------------------------

test('providers list returns entries with per-workspace configured flags + credentialFields', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  // Configure youtube for THIS workspace only.
  await seedCreds(workspace._id, 'youtube')

  const res = await bearer(
    request(buildApp())
      .get('/api/social/providers')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 6, 'all 6 real platforms listed')

  const yt = res.body.find(e => e.key === 'youtube')
  assert.ok(yt, 'youtube entry present')
  assert.equal(yt.configured, true, 'youtube configured for this workspace')
  assert.ok(Array.isArray(yt.credentialFields) && yt.credentialFields.length >= 2, 'credentialFields present')
  assert.ok(yt.redirectUri.includes('/api/social/youtube/callback'), 'redirectUri present')

  const tk = res.body.find(e => e.key === 'tiktok')
  assert.equal(tk.configured, false, 'tiktok not configured for this workspace')

  for (const entry of res.body) {
    assert.ok('key'              in entry)
    assert.ok('label'            in entry)
    assert.ok('configured'       in entry)
    assert.ok('credentialFields' in entry)
    assert.ok('redirectUri'      in entry)
  }
})

test('providers configured is per-workspace — other workspace creds do not leak', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser({ plan: 'pro' })
  const { workspace: ws2 }              = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(ws2._id, 'youtube')  // only ws2 is configured

  const res = await bearer(
    request(buildApp())
      .get('/api/social/providers')
      .set('X-Workspace-Id', ws1._id.toString()),
    tok1,
  )
  const yt = res.body.find(e => e.key === 'youtube')
  assert.equal(yt.configured, false, 'ws1 must not see ws2 credentials')
})

test('providers list 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry())).get('/api/social/providers')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 2. Credentials CRUD — PUT / GET / DELETE
// ---------------------------------------------------------------------------

test('PUT credentials stores encrypted values, GET reports configured + setKeys (no secrets)', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const app = buildApp(makeFakeRegistry())

  const put = await bearer(
    request(app)
      .put('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString())
      .send({ values: { client_id: 'my-id', client_secret: 'my-secret' } }),
    token,
  )
  assert.equal(put.status, 200)
  assert.equal(put.body.configured, true)

  // Stored encrypted (not plaintext) but decrypts to the supplied values.
  const row = await SocialAppCredential.findOne({ workspaceId: workspace._id, platform: 'youtube' })
  assert.ok(row, 'credential row created')
  assert.notEqual(row.valuesEnc, 'my-secret', 'valuesEnc not plaintext')
  const decrypted = JSON.parse(decryptToken(row.valuesEnc))
  assert.equal(decrypted.client_id, 'my-id')
  assert.equal(decrypted.client_secret, 'my-secret')

  // GET never leaks secret values.
  const get = await bearer(
    request(app)
      .get('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(get.status, 200)
  assert.equal(get.body.configured, true)
  assert.deepEqual(get.body.setKeys.sort(), ['client_id', 'client_secret'])
  assert.equal(JSON.stringify(get.body).includes('my-secret'), false, 'secret value never returned')
})

test('PUT credentials 400 when a required field is missing (lists missing)', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const app = buildApp(makeFakeRegistry())
  const res = await bearer(
    request(app)
      .put('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString())
      .send({ values: { client_id: 'only-id' } }),
    token,
  )
  assert.equal(res.status, 400)
  assert.ok(Array.isArray(res.body.missing), 'missing array present')
  assert.ok(res.body.missing.includes('client_secret'), 'reports missing client_secret')
})

test('PUT credentials 400 when an empty-string value is provided', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const app = buildApp(makeFakeRegistry())
  const res = await bearer(
    request(app)
      .put('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString())
      .send({ values: { client_id: 'id', client_secret: '   ' } }),
    token,
  )
  assert.equal(res.status, 400)
  assert.ok(res.body.missing.includes('client_secret'))
})

test('PUT credentials is plan-gated (free plan → 403 plan_feature)', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'free' })
  const app = buildApp(makeFakeRegistry())
  const res = await bearer(
    request(app)
      .put('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString())
      .send({ values: { client_id: 'id', client_secret: 'sec' } }),
    token,
  )
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
})

test('PUT credentials upserts (second PUT overwrites)', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const app = buildApp(makeFakeRegistry())
  const ws = workspace._id.toString()

  await bearer(request(app).put('/api/social/youtube/credentials').set('X-Workspace-Id', ws).send({ values: { client_id: 'a', client_secret: 'b' } }), token)
  await bearer(request(app).put('/api/social/youtube/credentials').set('X-Workspace-Id', ws).send({ values: { client_id: 'c', client_secret: 'd' } }), token)

  const rows = await SocialAppCredential.find({ workspaceId: workspace._id, platform: 'youtube' })
  assert.equal(rows.length, 1, 'still one row after upsert')
  assert.equal(JSON.parse(decryptToken(rows[0].valuesEnc)).client_id, 'c', 'second value wins')
})

test('DELETE credentials removes the row', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
  const app = buildApp(makeFakeRegistry())

  const del = await bearer(
    request(app)
      .delete('/api/social/youtube/credentials')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(del.status, 200)
  assert.equal(del.body.ok, true)
  const remaining = await SocialAppCredential.countDocuments({ workspaceId: workspace._id, platform: 'youtube' })
  assert.equal(remaining, 0)
})

test('GET credentials 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry())).get('/api/social/youtube/credentials')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 3. GET /api/social/:platform/connect — per-workspace creds
// ---------------------------------------------------------------------------

test('connect returns a url built from the workspace creds + state', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube', { client_id: 'WS-CID', client_secret: 'WS-CSEC' })
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
  assert.ok(res.body.url.includes('WS-CID'), 'url built from workspace creds')
  assert.ok(res.body.url.startsWith('https://fake-provider.test/auth'), 'url from fake provider')
})

test('connect 400 not_configured when workspace has no creds', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const registry = makeFakeRegistry()
  const res = await bearer(
    request(buildApp(registry))
      .get('/api/social/youtube/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 400)
  assert.ok(res.body.error, 'error message present')
  assert.equal(res.body.code, 'not_configured')
})

test('connect 400 for unknown platform', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  const registry = makeFakeRegistry()
  const res = await bearer(
    request(buildApp(registry))
      .get('/api/social/snapchat/connect')
      .set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 400)
})

test('connect 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry()))
    .get('/api/social/youtube/connect')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 4. GET /api/social/:platform/callback — loads creds from state.workspaceId
// ---------------------------------------------------------------------------

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
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state = await getValidStateFromConnect(app, workspace, token)
  const res = await request(app).get('/api/social/youtube/callback').query({ code: 'auth-code-123', state })

  assert.equal(res.status, 302, 'should redirect 302')
  assert.ok(res.headers.location?.includes('social=connected'))
  assert.ok(res.headers.location?.includes('platform=youtube'))

  const accounts = await SocialAccount.find({ workspaceId: workspace._id })
  assert.equal(accounts.length, 1, 'one account created')
  const acct = accounts[0]
  assert.equal(acct.platform, 'youtube')
  assert.equal(acct.externalId, 'ext1')
  assert.notEqual(acct.accessTokenEnc,  'AT')
  assert.notEqual(acct.refreshTokenEnc, 'RT')
  assert.equal(decryptToken(acct.accessTokenEnc),  'AT')
  assert.equal(decryptToken(acct.refreshTokenEnc), 'RT')
})

test('callback 400 not_configured when the state workspace has no creds', async () => {
  // Sign a valid state via connect (with creds), then delete creds before callback.
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
  const registry = makeFakeRegistry()
  const app = buildApp(registry)
  const state = await getValidStateFromConnect(app, workspace, token)

  await SocialAppCredential.deleteMany({ workspaceId: workspace._id, platform: 'youtube' })

  const res = await request(app).get('/api/social/youtube/callback').query({ code: 'c', state })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'not_configured')
})

test('callback with a garbage state token → 400', async () => {
  const res = await request(buildApp(makeFakeRegistry()))
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code', state: 'this.is.garbage' })
  assert.equal(res.status, 400)
})

test('callback with no state → 400', async () => {
  const res = await request(buildApp(makeFakeRegistry()))
    .get('/api/social/youtube/callback')
    .query({ code: 'auth-code' })
  assert.equal(res.status, 400)
})

test('callback with platform mismatch in state → 400', async () => {
  const { workspace } = await makeAuthedUser({ plan: 'pro' })
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const { signState } = await getSignStateHelper()
  const tiktokState = signState({
    workspaceId: workspace._id.toString(),
    platform:    'tiktok',
    userId:      new mongoose.Types.ObjectId().toString(),
    purpose:     'social_oauth',
  })

  const res = await request(app).get('/api/social/youtube/callback').query({ code: 'auth-code', state: tiktokState })
  assert.equal(res.status, 400)
  assert.ok(/mismatch/i.test(res.body.error))
})

async function getSignStateHelper() {
  const { default: jwt } = await import('jsonwebtoken')
  const { config } = await import('../config.js')
  return { signState: (payload) => jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' }) }
}

test('callback is idempotent — second call upserts, still one account', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
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
// 5. GET /api/social/accounts
// ---------------------------------------------------------------------------

test('accounts list returns toClient() shape with no *Enc fields', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'c', state })

  const res = await bearer(
    request(app).get('/api/social/accounts').set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  const acct = res.body[0]
  assert.ok(acct.id)
  assert.equal(acct.platform, 'youtube')
  assert.equal(acct.displayName, 'My Channel')
  assert.ok(!('accessTokenEnc'  in acct))
  assert.ok(!('refreshTokenEnc' in acct))
})

test('accounts list is workspace-scoped — other workspace accounts not returned', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()

  await SocialAccount.create({
    workspaceId:    ws2._id,
    platform:       'youtube',
    externalId:     'ext-other',
    displayName:    'Other workspace',
    accessTokenEnc: 'enc-placeholder',
    connectedBy:    new mongoose.Types.ObjectId(),
  })

  const app = buildApp(makeFakeRegistry())
  const res = await bearer(
    request(app).get('/api/social/accounts').set('X-Workspace-Id', ws1._id.toString()),
    tok1,
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 0)
})

test('accounts list 401 without auth', async () => {
  const res = await request(buildApp(makeFakeRegistry())).get('/api/social/accounts')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// 6. DELETE /api/social/accounts/:id
// ---------------------------------------------------------------------------

test('delete removes the account in the correct workspace', async () => {
  const { workspace, token } = await makeAuthedUser({ plan: 'pro' })
  await seedCreds(workspace._id, 'youtube')
  const registry = makeFakeRegistry()
  const app = buildApp(registry)

  const state = await getValidStateFromConnect(app, workspace, token)
  await request(app).get('/api/social/youtube/callback').query({ code: 'c', state })

  const accounts = await SocialAccount.find({ workspaceId: workspace._id })
  const id = accounts[0]._id.toString()

  const del = await bearer(
    request(app).delete(`/api/social/accounts/${id}`).set('X-Workspace-Id', workspace._id.toString()),
    token,
  )
  assert.equal(del.status, 200)
  assert.equal(del.body.ok, true)
  const remaining = await SocialAccount.countDocuments({ workspaceId: workspace._id })
  assert.equal(remaining, 0)
})

test('delete 404 for an account in a different workspace', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()

  const acct = await SocialAccount.create({
    workspaceId:    ws2._id,
    platform:       'youtube',
    externalId:     'ext-ws2',
    displayName:    'WS2 Channel',
    accessTokenEnc: 'enc-placeholder',
    connectedBy:    new mongoose.Types.ObjectId(),
  })

  const app = buildApp(makeFakeRegistry())
  const res = await bearer(
    request(app).delete(`/api/social/accounts/${acct._id}`).set('X-Workspace-Id', ws1._id.toString()),
    tok1,
  )
  assert.equal(res.status, 404)
})

test('delete 401 without auth', async () => {
  const id = new mongoose.Types.ObjectId()
  const res = await request(buildApp(makeFakeRegistry())).delete(`/api/social/accounts/${id}`)
  assert.equal(res.status, 401)
})
