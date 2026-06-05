// Set SOCIAL_TOKEN_KEY before any import that pulls in cryptoTokens.
process.env.SOCIAL_TOKEN_KEY = 'test-social-token-key-for-plan-gating-tests-xxx'

import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import { socialRouter } from '../routes/social.js'
import Workspace from '../models/Workspace.js'
import SocialAccount from '../models/SocialAccount.js'
import { makeAuthedUser } from './helpers/auth.js'
import { encryptToken } from '../utils/cryptoTokens.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

const Q = { add: async () => ({ id: 'b' }) }

function genApp(q = Q) {
  const a = express(); a.use(express.json())
  a.locals.generationQueue = q
  a.use('/api/generate', generateRoutes)
  return a
}

function socialApp({ queue, registry } = {}) {
  const a = express(); a.use(express.json())
  if (queue) a.locals.socialPublishQueue = queue
  if (registry) a.locals.socialProviders = registry
  a.use('/api/social', socialRouter)
  return a
}

const authedGen  = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
const authedSoc  = authedGen

/** Create a managedBeta workspace on the given plan. */
async function betaUserWithPlan(plan) {
  const { user, token, workspace } = await makeAuthedUser({ plan })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  return { user, token, workspace: ws }
}

/** Minimal fake social provider registry. */
function makeRegistry(configured = true) {
  const prov = {
    meta:        { key: 'youtube', label: 'YouTube' },
    isConfigured: () => configured,
    getAuthUrl:  ({ state }) => `https://fake.test/auth?state=${state}`,
    exchangeCode: async () => ({ account: { externalId: 'e1', displayName: 'Ch' }, tokens: { accessToken: 'AT', refreshToken: null, expiresAt: null } }),
    publishVideo: async () => ({ externalId: 'v1', url: 'https://youtube.com/v1' }),
  }
  return {
    getProvider: (k) => {
      if (k === 'youtube') return prov
      throw new Error(`Unknown social platform: ${k}`)
    },
    listConfigured: () => [{ key: 'youtube', label: 'YouTube', configured }],
  }
}

// ===========================================================================
// Generate routes — plan-feature gating
// ===========================================================================

// ── voice ────────────────────────────────────────────────────────────────────

test('free plan → POST /generate/voice → 403 plan_feature voice', async () => {
  const { token, workspace } = await betaUserWithPlan('free')
  const res = await authedGen(request(genApp()).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'hello', tier: 'standard' })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'voice')
  assert.equal(res.body.requiredPlan, 'pro')
  assert.ok(res.body.error, 'error message present')
})

test('pro plan → POST /generate/voice → 202', async () => {
  const { token, workspace } = await betaUserWithPlan('pro')
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const res = await authedGen(request(genApp()).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'hello', tier: 'standard' })
  assert.equal(res.status, 202)
})

test('studio plan → POST /generate/voice → 202', async () => {
  const { token, workspace } = await betaUserWithPlan('studio')
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 100, purchasedCredits: 0, creditPeriod: period })
  const res = await authedGen(request(genApp()).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'hello', tier: 'standard' })
  assert.equal(res.status, 202)
})

// ── video ────────────────────────────────────────────────────────────────────

test('free plan → POST /generate/video → 403 plan_feature video', async () => {
  const { token, workspace } = await betaUserWithPlan('free')
  const res = await authedGen(request(genApp()).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'dragon', tier: 'standard' })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'video')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('pro plan → POST /generate/video → 202', async () => {
  const { token, workspace } = await betaUserWithPlan('pro')
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 200, purchasedCredits: 0, creditPeriod: period })
  const res = await authedGen(request(genApp()).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'dragon', tier: 'standard' })
  assert.equal(res.status, 202)
})

// ── image ─────────────────────────────────────────────────────────────────────

test('free plan → POST /generate/image → 202 (image allowed on free)', async () => {
  const { token, workspace } = await betaUserWithPlan('free')
  // free plan gets 25 starter credits on first managed call (refill)
  const res = await authedGen(request(genApp()).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard' })
  assert.equal(res.status, 202)
})

// ── text ──────────────────────────────────────────────────────────────────────

test('free plan → POST /generate/text → 202 (text allowed on free)', async () => {
  const { token, workspace } = await betaUserWithPlan('free')
  const res = await authedGen(request(genApp()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'Once upon a time', rightsConfirmed: true, tier: 'standard' })
  assert.equal(res.status, 202)
})

// ===========================================================================
// Social routes — plan-feature gating
// ===========================================================================

test('free plan → GET /social/:platform/connect → 403 plan_feature social', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'free' })
  const registry = makeRegistry()
  const res = await authedSoc(
    request(socialApp({ registry })).get('/api/social/youtube/connect'),
    token, workspace._id,
  )
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'social')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('pro plan → GET /social/:platform/connect → 200', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'pro' })
  const registry = makeRegistry()
  const res = await authedSoc(
    request(socialApp({ registry })).get('/api/social/youtube/connect'),
    token, workspace._id,
  )
  assert.equal(res.status, 200)
  assert.ok(res.body.url, 'url returned')
})

test('free plan → POST /social/posts → 403 plan_feature social', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'free' })
  const FUTURE = new Date(Date.now() + 60_000).toISOString()
  const registry = makeRegistry()
  const res = await authedSoc(
    request(socialApp({ registry })).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/vid.mp4',
      targets:     ['youtube'],
      scheduledAt: FUTURE,
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'social')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('pro plan → POST /social/posts with connected account → 202', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'pro' })
  // Seed a connected account
  await SocialAccount.create({
    workspaceId:    workspace._id,
    platform:       'youtube',
    externalId:     'ext1',
    displayName:    'My Channel',
    accessTokenEnc: encryptToken('ACCESS_TOKEN'),
    connectedBy:    workspace.ownerId,
  })
  const fakeQueue = { add: async () => ({ id: 'j1' }), remove: async () => {} }
  const registry = makeRegistry()
  const FUTURE = new Date(Date.now() + 60_000).toISOString()
  const res = await authedSoc(
    request(socialApp({ queue: fakeQueue, registry })).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/vid.mp4',
      title:       'Test',
      caption:     '',
      targets:     ['youtube'],
      scheduledAt: FUTURE,
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 202)
  assert.ok(res.body.id, 'post id returned')
})

// Providers list is plan-ungated (free plan can see available providers)
test('free plan → GET /social/providers → 200 (listing is not gated)', async () => {
  const { token } = await makeAuthedUser({ plan: 'free' })
  const registry = makeRegistry()
  const res = request(socialApp({ registry }))
    .get('/api/social/providers')
    .set('Authorization', `Bearer ${token}`)
  const r = await res
  assert.equal(r.status, 200)
})
