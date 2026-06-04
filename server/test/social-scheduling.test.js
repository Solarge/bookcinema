// Set SOCIAL_TOKEN_KEY before any import that might pull in cryptoTokens.
process.env.SOCIAL_TOKEN_KEY = 'test-social-token-key-for-scheduling-tests-xx'

import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { makeAuthedUser } from './helpers/auth.js'
import { socialRouter } from '../routes/social.js'
import ScheduledPost from '../models/ScheduledPost.js'
import SocialAccount from '../models/SocialAccount.js'
import { processSocialPublish } from '../worker/processSocialPublish.js'
import { encryptToken } from '../utils/cryptoTokens.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const FUTURE = () => new Date(Date.now() + 60_000)
const PAST   = () => new Date(Date.now() - 60_000)

/** Build an express app with the social router; optionally inject queue + registry. */
function buildApp({ queue, registry } = {}) {
  const a = express()
  a.use(express.json())
  if (queue)    a.locals.socialPublishQueue = queue
  if (registry) a.locals.socialProviders    = registry
  a.use('/api/social', socialRouter)
  return a
}

const bearer  = (req, token)    => req.set('Authorization', `Bearer ${token}`)
const authed  = (req, token, ws) =>
  req.set('Authorization', `Bearer ${token}`).set('X-Workspace-Id', ws.toString())

/** A configured fake provider that succeeds at publishVideo. */
function makeFakeProvider(overrides = {}) {
  return {
    meta:         { key: 'youtube', label: 'YouTube' },
    isConfigured: () => true,
    getAuthUrl:   ({ state }) => `https://fake.test/auth?state=${state}`,
    exchangeCode: async () => ({ account: { externalId: 'ext1', displayName: 'Ch' }, tokens: { accessToken: 'AT', refreshToken: 'RT', expiresAt: FUTURE() } }),
    refresh:      async ({ refreshToken }) => ({ accessToken: 'NEW_AT', refreshToken: 'NEW_RT', expiresAt: FUTURE() }),
    publishVideo: async () => ({ externalId: 'vid123', url: 'https://youtube.com/watch?v=vid123' }),
    ...overrides,
  }
}

/** Build a fake registry accepting a map of { platform → provider }. */
function makeFakeRegistry(providerMap) {
  const defaults = {}
  for (const p of ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin']) {
    defaults[p] = makeFakeProvider({ meta: { key: p, label: p }, isConfigured: () => false })
  }
  const merged = { ...defaults, ...providerMap }
  return {
    getProvider: (k) => {
      if (!merged[k]) throw new Error(`Unknown social platform: ${k}`)
      return merged[k]
    },
    listConfigured: () => Object.entries(merged).map(([key, p]) => ({
      key, label: p.meta.label, configured: p.isConfigured(),
    })),
  }
}

/** Seed a SocialAccount with real encrypted tokens for processor tests. */
async function seedAccount(workspaceId, platform = 'youtube', opts = {}) {
  return SocialAccount.create({
    workspaceId,
    platform,
    externalId:      opts.externalId      || 'ext-' + Math.random().toString(36).slice(2),
    displayName:     opts.displayName     || 'Test Channel',
    accessTokenEnc:  encryptToken(opts.accessToken  || 'plainAccessToken'),
    refreshTokenEnc: opts.refreshToken ? encryptToken(opts.refreshToken) : undefined,
    expiresAt:       opts.expiresAt || null,
    connectedBy:     workspaceId,
  })
}

/** Seed a ScheduledPost with targets already resolved to socialAccountId. */
async function seedPost(workspaceId, createdBy, accountId, platform = 'youtube', opts = {}) {
  return ScheduledPost.create({
    workspaceId,
    createdBy,
    videoUrl:    opts.videoUrl    || 'https://s3.example/video.mp4',
    title:       opts.title       || 'Test Video',
    caption:     opts.caption     || 'Check this out!',
    perPlatformCaption: opts.perPlatformCaption || {},
    targets:     [{ platform, socialAccountId: accountId, status: 'pending' }],
    scheduledAt: opts.scheduledAt || FUTURE(),
    status:      opts.status      || 'scheduled',
    jobId:       opts.jobId       || null,
  })
}

// ===========================================================================
// PROCESSOR TESTS — call processSocialPublish directly (no Redis)
// ===========================================================================

test('processor: all targets posted → post status "completed"', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId)
  const post    = await seedPost(wsId, userId, account._id)

  const fakeProvider = makeFakeProvider()
  await processSocialPublish(post._id.toString(), { getProvider: () => fakeProvider })

  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.status, 'completed')
  assert.equal(updated.targets[0].status,     'posted')
  assert.equal(updated.targets[0].externalId, 'vid123')
  assert.ok(updated.targets[0].postUrl?.includes('youtube.com'))
})

test('processor: provider throws on one target → target failed, post "failed" (single target)', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId)
  const post    = await seedPost(wsId, userId, account._id)

  const throwingProvider = makeFakeProvider({
    publishVideo: async () => { throw new Error('upload quota exceeded') },
  })
  await processSocialPublish(post._id.toString(), { getProvider: () => throwingProvider })

  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.status, 'failed')
  assert.equal(updated.targets[0].status, 'failed')
  assert.match(updated.targets[0].error, /quota exceeded/)
})

test('processor: mixed targets (one posted, one failed) → post status "partial"', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const ytAcct  = await seedAccount(wsId, 'youtube')
  const tkAcct  = await seedAccount(wsId, 'tiktok')

  const post = await ScheduledPost.create({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://s3.example/video.mp4',
    title:       'Two platforms',
    caption:     'caption',
    targets: [
      { platform: 'youtube', socialAccountId: ytAcct._id, status: 'pending' },
      { platform: 'tiktok',  socialAccountId: tkAcct._id, status: 'pending' },
    ],
    scheduledAt: FUTURE(),
    status:      'scheduled',
  })

  const getProvider = (platform) => {
    if (platform === 'youtube') return makeFakeProvider()
    // tiktok throws
    return makeFakeProvider({ publishVideo: async () => { throw new Error('TikTok error') } })
  }
  await processSocialPublish(post._id.toString(), { getProvider })

  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.status, 'partial')
  const yt = updated.targets.find(t => t.platform === 'youtube')
  const tk = updated.targets.find(t => t.platform === 'tiktok')
  assert.equal(yt.status, 'posted')
  assert.equal(tk.status, 'failed')
})

test('processor: expired token triggers provider.refresh and new tokens persisted', async () => {
  const wsId   = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId, 'youtube', {
    accessToken:  'OLD_AT',
    refreshToken: 'OLD_RT',
    expiresAt:    PAST(),  // expired
  })
  const originalEnc = account.accessTokenEnc
  const post = await seedPost(wsId, userId, account._id)

  let refreshCalled = false
  const provider = makeFakeProvider({
    refresh: async ({ refreshToken }) => {
      refreshCalled = true
      assert.equal(refreshToken, 'OLD_RT', 'refresh called with old refreshToken')
      return { accessToken: 'NEW_AT', refreshToken: 'NEW_RT', expiresAt: FUTURE() }
    },
  })
  await processSocialPublish(post._id.toString(), { getProvider: () => provider })

  assert.ok(refreshCalled, 'provider.refresh was called for expired token')

  // Token in DB must have changed
  const updatedAccount = await SocialAccount.findById(account._id)
  assert.notEqual(updatedAccount.accessTokenEnc, originalEnc, 'accessTokenEnc changed after refresh')
})

test('processor: deleted SocialAccount → target failed with "account disconnected"', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  // Use a random ObjectId that does not correspond to a real account
  const ghostId = new mongoose.Types.ObjectId()

  const post = await ScheduledPost.create({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://s3.example/video.mp4',
    title:       'Ghost account test',
    caption:     '',
    targets:     [{ platform: 'youtube', socialAccountId: ghostId, status: 'pending' }],
    scheduledAt: FUTURE(),
    status:      'scheduled',
  })

  const provider = makeFakeProvider()
  await processSocialPublish(post._id.toString(), { getProvider: () => provider })

  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.targets[0].status, 'failed')
  assert.match(updated.targets[0].error, /account disconnected/)
  assert.equal(updated.status, 'failed')
})

test('processor: already-posted target is skipped (idempotent)', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId)

  const post = await ScheduledPost.create({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://s3.example/video.mp4',
    title:       'Idempotent test',
    caption:     '',
    targets:     [{ platform: 'youtube', socialAccountId: account._id, status: 'posted', externalId: 'already-done' }],
    scheduledAt: FUTURE(),
    status:      'processing',
  })

  let publishCalled = false
  const provider = makeFakeProvider({
    publishVideo: async () => { publishCalled = true; return { externalId: 'NEW', url: 'http://new' } },
  })
  await processSocialPublish(post._id.toString(), { getProvider: () => provider })

  assert.ok(!publishCalled, 'publishVideo must NOT be called for already-posted target')
  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.targets[0].externalId, 'already-done', 'externalId unchanged')
  assert.equal(updated.status, 'completed', 'single already-posted target → completed')
})

test('processor: returns early for non-existent postId', async () => {
  const ghostId = new mongoose.Types.ObjectId().toString()
  // Should not throw
  await assert.doesNotReject(() => processSocialPublish(ghostId, { getProvider: () => makeFakeProvider() }))
})

test('processor: returns early for canceled post', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId)
  const post    = await seedPost(wsId, userId, account._id, 'youtube', { status: 'canceled' })

  let publishCalled = false
  const provider = makeFakeProvider({ publishVideo: async () => { publishCalled = true; return {} } })
  await processSocialPublish(post._id.toString(), { getProvider: () => provider })

  assert.ok(!publishCalled, 'publishVideo must NOT be called for canceled post')
  const updated = await ScheduledPost.findById(post._id)
  assert.equal(updated.status, 'canceled', 'status unchanged')
})

test('processor: uses perPlatformCaption over post.caption when present', async () => {
  const wsId    = new mongoose.Types.ObjectId()
  const userId  = new mongoose.Types.ObjectId()
  const account = await seedAccount(wsId, 'youtube')
  const post    = await seedPost(wsId, userId, account._id, 'youtube', {
    caption:            'default caption',
    perPlatformCaption: { youtube: 'youtube-specific caption' },
  })

  let captionUsed = null
  const provider = makeFakeProvider({
    publishVideo: async ({ caption }) => { captionUsed = caption; return { externalId: 'x', url: 'http://y' } },
  })
  await processSocialPublish(post._id.toString(), { getProvider: () => provider })
  assert.equal(captionUsed, 'youtube-specific caption')
})

// ===========================================================================
// ROUTE TESTS — inject fake queue + fake registry (no Redis)
// ===========================================================================

test('POST /api/social/posts 202 with future scheduledAt + connected account, jobId saved', async () => {
  const { user, workspace, token } = await makeAuthedUser()

  // Seed a connected account in this workspace
  const account = await seedAccount(workspace._id, 'youtube')

  const captured = {}
  const fakeQueue = {
    add: async (name, data, opts) => {
      captured.name = name
      captured.data = data
      captured.opts = opts
      return { id: 'job1' }
    },
    remove: async () => {},
  }

  const registry = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app = buildApp({ queue: fakeQueue, registry })

  const scheduledAt = new Date(Date.now() + 120_000).toISOString()
  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/video.mp4',
      title:       'My Video',
      caption:     'Caption text',
      targets:     ['youtube'],
      scheduledAt,
    }),
    token, workspace._id,
  )

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  // toClient() returns id (not _id) and omits jobId
  assert.ok(res.body.id, 'post id returned')
  assert.equal(res.body.jobId, undefined, 'jobId must NOT be in client response')
  assert.equal(res.body.socialAccountId, undefined, 'socialAccountId must NOT be in client response')
  assert.equal(captured.name, 'social-publish')
  assert.equal(captured.data.postId, res.body.id)
  assert.ok(captured.opts.delay > 0, 'delay > 0 for future scheduledAt')

  // Post persisted in DB with jobId
  const dbPost = await ScheduledPost.findById(res.body.id)
  assert.ok(dbPost, 'post in DB')
  assert.equal(dbPost.jobId, 'job1')
})

test('POST /api/social/posts 400 when scheduledAt is in the past', async () => {
  const { workspace, token } = await makeAuthedUser()
  const account = await seedAccount(workspace._id, 'youtube')
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/video.mp4',
      title:       'Test',
      caption:     '',
      targets:     ['youtube'],
      scheduledAt: new Date(Date.now() - 5000).toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 400)
  assert.match(res.body.error, /future/)
})

test('POST /api/social/posts 400 when scheduledAt is missing', async () => {
  const { workspace, token } = await makeAuthedUser()
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl: 'https://s3.example/video.mp4',
      targets:  ['youtube'],
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 400)
})

test('POST /api/social/posts 400 when videoUrl is missing', async () => {
  const { workspace, token } = await makeAuthedUser()
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 400)
  assert.match(res.body.error, /videoUrl/)
})

test('POST /api/social/posts 422 when target platform has no connected account', async () => {
  const { workspace, token } = await makeAuthedUser()
  // No SocialAccount seeded for this workspace
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/video.mp4',
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 422)
  assert.ok(Array.isArray(res.body.invalidTargets), 'invalidTargets array present')
  assert.equal(res.body.invalidTargets[0].platform, 'youtube')
})

test('POST /api/social/posts 422 when target provider is not configured', async () => {
  const { workspace, token } = await makeAuthedUser()
  await seedAccount(workspace._id, 'youtube')
  const fakeQueue  = { add: async () => ({ id: 'j' }), remove: async () => {} }
  // youtube is NOT configured in this registry
  const registry = makeFakeRegistry({
    youtube: makeFakeProvider({ isConfigured: () => false }),
  })
  const app = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/video.mp4',
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 422)
  assert.equal(res.body.invalidTargets[0].reason, 'provider not configured')
})

test('POST /api/social/posts 401 without auth', async () => {
  const res = await request(buildApp()).post('/api/social/posts').send({
    videoUrl: 'https://s3.example/v.mp4', targets: ['youtube'], scheduledAt: FUTURE().toISOString(),
  })
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// GET /api/social/posts
// ---------------------------------------------------------------------------

test('GET /api/social/posts returns workspace-scoped posts newest first', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()
  const uid = new mongoose.Types.ObjectId()

  // Two posts in ws1, one in ws2
  await ScheduledPost.create([
    { workspaceId: ws1._id, createdBy: uid, videoUrl: 'https://s3.example/v1.mp4', title: 'A', caption: '', targets: [], scheduledAt: FUTURE(), status: 'scheduled' },
    { workspaceId: ws1._id, createdBy: uid, videoUrl: 'https://s3.example/v2.mp4', title: 'B', caption: '', targets: [], scheduledAt: FUTURE(), status: 'scheduled' },
    { workspaceId: ws2._id, createdBy: uid, videoUrl: 'https://s3.example/v3.mp4', title: 'C', caption: '', targets: [], scheduledAt: FUTURE(), status: 'scheduled' },
  ])

  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const app = buildApp({ queue: fakeQueue, registry: makeFakeRegistry({}) })

  const res = await authed(request(app).get('/api/social/posts'), tok1, ws1._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 2, 'ws1 should see only 2 posts')
  // Newest first
  assert.ok(new Date(res.body[0].createdAt) >= new Date(res.body[1].createdAt), 'sorted newest first')
})

test('GET /api/social/posts 401 without auth', async () => {
  const res = await request(buildApp()).get('/api/social/posts')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// DELETE /api/social/posts/:id
// ---------------------------------------------------------------------------

test('DELETE /api/social/posts/:id cancels a scheduled post + calls queue.remove', async () => {
  const { workspace, token } = await makeAuthedUser()
  const uid = new mongoose.Types.ObjectId()

  const post = await ScheduledPost.create({
    workspaceId: workspace._id,
    createdBy:   uid,
    videoUrl:    'https://s3.example/v.mp4',
    title:       'To cancel',
    caption:     '',
    targets:     [],
    scheduledAt: FUTURE(),
    status:      'scheduled',
    jobId:       'job-to-remove',
  })

  let removedJobId = null
  const fakeQueue = {
    add: async () => ({ id: 'j' }),
    remove: async (id) => { removedJobId = id },
  }
  const app = buildApp({ queue: fakeQueue, registry: makeFakeRegistry({}) })

  const res = await authed(request(app).delete(`/api/social/posts/${post._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(removedJobId, 'job-to-remove', 'queue.remove called with the stored jobId')

  const dbPost = await ScheduledPost.findById(post._id)
  assert.equal(dbPost.status, 'canceled')
})

test('DELETE /api/social/posts/:id 409 for a completed post', async () => {
  const { workspace, token } = await makeAuthedUser()
  const uid = new mongoose.Types.ObjectId()

  const post = await ScheduledPost.create({
    workspaceId: workspace._id,
    createdBy:   uid,
    videoUrl:    'https://s3.example/v.mp4',
    title:       'Done',
    caption:     '',
    targets:     [],
    scheduledAt: FUTURE(),
    status:      'completed',
  })

  const app = buildApp({ queue: { add: async () => ({}), remove: async () => {} }, registry: makeFakeRegistry({}) })
  const res = await authed(request(app).delete(`/api/social/posts/${post._id}`), token, workspace._id)
  assert.equal(res.status, 409)
  assert.match(res.body.error, /completed/)
})

test('DELETE /api/social/posts/:id 409 for a processing post', async () => {
  const { workspace, token } = await makeAuthedUser()
  const uid = new mongoose.Types.ObjectId()

  const post = await ScheduledPost.create({
    workspaceId: workspace._id,
    createdBy:   uid,
    videoUrl:    'https://s3.example/v.mp4',
    title:       'Processing',
    caption:     '',
    targets:     [],
    scheduledAt: FUTURE(),
    status:      'processing',
  })

  const app = buildApp({ queue: { add: async () => ({}), remove: async () => {} }, registry: makeFakeRegistry({}) })
  const res = await authed(request(app).delete(`/api/social/posts/${post._id}`), token, workspace._id)
  assert.equal(res.status, 409)
})

test('DELETE /api/social/posts/:id 404 for post not in this workspace', async () => {
  const { workspace: ws1, token: tok1 } = await makeAuthedUser()
  const { workspace: ws2 }              = await makeAuthedUser()
  const uid = new mongoose.Types.ObjectId()

  const post = await ScheduledPost.create({
    workspaceId: ws2._id,
    createdBy:   uid,
    videoUrl:    'https://s3.example/v.mp4',
    title:       'WS2 post',
    caption:     '',
    targets:     [],
    scheduledAt: FUTURE(),
    status:      'scheduled',
  })

  const app = buildApp({ queue: { add: async () => ({}), remove: async () => {} }, registry: makeFakeRegistry({}) })
  const res = await authed(request(app).delete(`/api/social/posts/${post._id}`), tok1, ws1._id)
  assert.equal(res.status, 404)
})

test('DELETE /api/social/posts/:id 401 without auth', async () => {
  const id  = new mongoose.Types.ObjectId()
  const res = await request(buildApp()).delete(`/api/social/posts/${id}`)
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// POST /api/social/posts: no Redis (null queue) still creates the post
// ---------------------------------------------------------------------------

test('POST /api/social/posts creates post even when queue is null (no Redis)', async () => {
  const { workspace, token } = await makeAuthedUser()
  await seedAccount(workspace._id, 'youtube')

  // No queue injected → getSocialPublishQueue() returns null (no REDIS_URL)
  const registry = makeFakeRegistry({ youtube: makeFakeProvider() })
  // We must inject null explicitly to override any potential real queue
  const appWithNullQueue = express()
  appWithNullQueue.use(express.json())
  appWithNullQueue.locals.socialPublishQueue = null
  appWithNullQueue.locals.socialProviders    = registry
  appWithNullQueue.use('/api/social', socialRouter)

  const res = await authed(
    request(appWithNullQueue).post('/api/social/posts').send({
      videoUrl:    'https://s3.example/video.mp4',
      title:       'No Redis Test',
      caption:     '',
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 202)
  assert.ok(res.body.id, 'post id returned')
  // jobId must never be in the client response
  assert.equal(res.body.jobId, undefined, 'jobId must NOT be in client response')
})

// ---------------------------------------------------------------------------
// Finding A: SSRF rejection for dangerous videoUrl values
// ---------------------------------------------------------------------------

test('POST /api/social/posts 400 invalid_video_url for IMDS metadata URL', async () => {
  const { workspace, token } = await makeAuthedUser()
  await seedAccount(workspace._id, 'youtube')
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'http://169.254.169.254/latest/meta-data',
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'invalid_video_url')
})

test('POST /api/social/posts 400 invalid_video_url for http (non-https) URL', async () => {
  const { workspace, token } = await makeAuthedUser()
  await seedAccount(workspace._id, 'youtube')
  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const registry  = makeFakeRegistry({ youtube: makeFakeProvider() })
  const app       = buildApp({ queue: fakeQueue, registry })

  const res = await authed(
    request(app).post('/api/social/posts').send({
      videoUrl:    'http://s3.example/video.mp4',
      targets:     ['youtube'],
      scheduledAt: FUTURE().toISOString(),
    }),
    token, workspace._id,
  )
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'invalid_video_url')
})

// ---------------------------------------------------------------------------
// Finding B: GET /posts response must not expose internal fields
// ---------------------------------------------------------------------------

test('GET /api/social/posts response objects do NOT contain socialAccountId, jobId, createdBy, workspaceId', async () => {
  const { workspace, token } = await makeAuthedUser()
  const uid     = new mongoose.Types.ObjectId()
  const account = await seedAccount(workspace._id, 'youtube')

  await seedPost(workspace._id, uid, account._id, 'youtube', { jobId: 'job-secret' })

  const fakeQueue = { add: async () => ({ id: 'j' }), remove: async () => {} }
  const app = buildApp({ queue: fakeQueue, registry: makeFakeRegistry({}) })

  const res = await authed(request(app).get('/api/social/posts'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.ok(res.body.length >= 1, 'at least one post returned')

  for (const p of res.body) {
    assert.equal(p.socialAccountId, undefined, 'socialAccountId must be absent')
    assert.equal(p.jobId,           undefined, 'jobId must be absent')
    assert.equal(p.createdBy,       undefined, 'createdBy must be absent')
    assert.equal(p.workspaceId,     undefined, 'workspaceId must be absent')
    // Safe fields must be present
    assert.ok(p.id,          'id present')
    assert.ok(p.videoUrl,    'videoUrl present')
    assert.ok(p.status,      'status present')
    assert.ok(p.scheduledAt, 'scheduledAt present')
  }
})
