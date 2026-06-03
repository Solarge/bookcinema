// Set SOCIAL_TOKEN_KEY before any import that might pull in config or cryptoTokens.
// We set it via process.env directly here — before config.js is evaluated.
process.env.SOCIAL_TOKEN_KEY = 'test-social-token-key-for-foundation-tests'

import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'

import { encryptToken, decryptToken } from '../utils/cryptoTokens.js'
import SocialAccount from '../models/SocialAccount.js'
import ScheduledPost from '../models/ScheduledPost.js'
import { getProvider, listConfigured, SOCIAL_PROVIDERS } from '../social/index.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

// ---------------------------------------------------------------------------
// 1. cryptoTokens: encrypt/decrypt round-trip + tamper detection
// ---------------------------------------------------------------------------

test('encryptToken/decryptToken round-trips the original plaintext', () => {
  const plain = 'super-secret-oauth-token-abc123'
  const enc = encryptToken(plain)
  assert.equal(typeof enc, 'string', 'encrypted value is a string')
  assert.notEqual(enc, plain, 'encrypted value differs from plaintext')
  const dec = decryptToken(enc)
  assert.equal(dec, plain, 'decrypted value matches original')
})

test('encryptToken produces different ciphertext each call (random IV)', () => {
  const plain = 'same-input'
  const a = encryptToken(plain)
  const b = encryptToken(plain)
  assert.notEqual(a, b, 'each call should produce a unique ciphertext due to random IV')
  // But both must decrypt correctly
  assert.equal(decryptToken(a), plain)
  assert.equal(decryptToken(b), plain)
})

test('decryptToken throws when the ciphertext is tampered', () => {
  const enc = encryptToken('legitimate-token')
  // Corrupt the ciphertext section (third segment)
  const parts = enc.split(':')
  const badCipher = parts[2].split('').reverse().join('')
  const tampered = `${parts[0]}:${parts[1]}:${badCipher}`
  assert.throws(() => decryptToken(tampered), /Unsupported state|bad decrypt|auth tag/i)
})

test('decryptToken throws on a completely invalid format', () => {
  assert.throws(() => decryptToken('not-a-valid-enc-string'), /Invalid encrypted token format/)
})

// ---------------------------------------------------------------------------
// 2. SocialAccount.toClient() never exposes encrypted token fields
// ---------------------------------------------------------------------------

test('SocialAccount.toClient() omits accessTokenEnc and refreshTokenEnc', async () => {
  const wsId  = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  const account = new SocialAccount({
    workspaceId:     wsId,
    platform:        'youtube',
    externalId:      'yt-channel-123',
    displayName:     'My Channel',
    accessTokenEnc:  encryptToken('access-token-secret'),
    refreshTokenEnc: encryptToken('refresh-token-secret'),
    expiresAt:       new Date(Date.now() + 3600_000),
    scopes:          ['https://www.googleapis.com/auth/youtube.upload'],
    connectedBy:     userId,
  })

  const client = account.toClient()

  // Required fields present
  assert.ok(client.id,           'id present')
  assert.equal(client.platform,    'youtube')
  assert.equal(client.displayName, 'My Channel')
  assert.ok(client.expiresAt,    'expiresAt present')

  // Sensitive fields must be absent
  assert.ok(!('accessTokenEnc'  in client), 'accessTokenEnc must not appear in toClient()')
  assert.ok(!('refreshTokenEnc' in client), 'refreshTokenEnc must not appear in toClient()')
  assert.ok(!('scopes'          in client), 'scopes must not appear in toClient()')
  assert.ok(!('connectedBy'     in client), 'connectedBy must not appear in toClient()')
})

// ---------------------------------------------------------------------------
// 3. Social provider registry
// ---------------------------------------------------------------------------

test('SOCIAL_PROVIDERS contains all 5 platforms', () => {
  const keys = Array.from(SOCIAL_PROVIDERS.keys())
  assert.deepEqual(keys.sort(), ['linkedin', 'meta', 'tiktok', 'twitter', 'youtube'])
})

test('getProvider returns a module for each known platform', () => {
  for (const key of ['youtube', 'tiktok', 'meta', 'twitter', 'linkedin']) {
    const provider = getProvider(key)
    assert.ok(provider,                  `${key}: module returned`)
    assert.ok(provider.meta,             `${key}: meta exported`)
    assert.equal(provider.meta.key, key, `${key}: meta.key matches`)
    assert.ok(typeof provider.isConfigured === 'function', `${key}: isConfigured is a function`)
    assert.ok(typeof provider.getAuthUrl  === 'function', `${key}: getAuthUrl is a function`)
    assert.ok(typeof provider.publishVideo === 'function', `${key}: publishVideo is a function`)
  }
})

test('getProvider throws on an unknown platform key', () => {
  assert.throws(() => getProvider('snapchat'), /Unknown social platform/)
})

test('listConfigured returns 5 entries', () => {
  const list = listConfigured()
  assert.equal(list.length, 5)
  for (const entry of list) {
    assert.ok(entry.key,   'key present')
    assert.ok(entry.label, 'label present')
    assert.ok('configured' in entry, 'configured present')
  }
})

test('isConfigured() is false when env vars are not set', () => {
  // Make sure none of the platform env vars are set
  const envPairs = [
    ['YOUTUBE_CLIENT_ID',     'YOUTUBE_CLIENT_SECRET'],
    ['TIKTOK_CLIENT_KEY',     'TIKTOK_CLIENT_SECRET'],
    ['META_APP_ID',           'META_APP_SECRET'],
    ['TWITTER_CLIENT_ID',     'TWITTER_CLIENT_SECRET'],
    ['LINKEDIN_CLIENT_ID',    'LINKEDIN_CLIENT_SECRET'],
  ]
  for (const [idKey, secretKey] of envPairs) {
    const saved = { id: process.env[idKey], secret: process.env[secretKey] }
    delete process.env[idKey]
    delete process.env[secretKey]
    // Re-test after deletion — should be false
    const [, provider] = Array.from(SOCIAL_PROVIDERS.entries()).find(([k]) => {
      const p = SOCIAL_PROVIDERS.get(k)
      return p.meta.configEnv.includes(idKey)
    })
    assert.equal(provider.isConfigured(), false, `${idKey} unset → isConfigured() false`)
    // Restore
    if (saved.id     !== undefined) process.env[idKey]    = saved.id
    if (saved.secret !== undefined) process.env[secretKey] = saved.secret
  }
})

test('isConfigured() becomes true after env vars are set, false after deletion', () => {
  const youtube = getProvider('youtube')

  const savedId     = process.env.YOUTUBE_CLIENT_ID
  const savedSecret = process.env.YOUTUBE_CLIENT_SECRET
  delete process.env.YOUTUBE_CLIENT_ID
  delete process.env.YOUTUBE_CLIENT_SECRET

  assert.equal(youtube.isConfigured(), false, 'false when env vars absent')

  process.env.YOUTUBE_CLIENT_ID     = 'test-yt-client-id'
  process.env.YOUTUBE_CLIENT_SECRET = 'test-yt-client-secret'
  assert.equal(youtube.isConfigured(), true, 'true after env vars set')

  delete process.env.YOUTUBE_CLIENT_ID
  delete process.env.YOUTUBE_CLIENT_SECRET
  assert.equal(youtube.isConfigured(), false, 'false again after deletion')

  // Restore
  if (savedId     !== undefined) process.env.YOUTUBE_CLIENT_ID     = savedId
  if (savedSecret !== undefined) process.env.YOUTUBE_CLIENT_SECRET = savedSecret
})

// ---------------------------------------------------------------------------
// 4. ScheduledPost validates target.status enum
// ---------------------------------------------------------------------------

test('ScheduledPost saves with valid target status', async () => {
  const wsId   = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  const post = new ScheduledPost({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://example.com/video.mp4',
    title:       'My video',
    caption:     'Check this out!',
    targets:     [{ platform: 'youtube', status: 'pending' }],
    scheduledAt: new Date(Date.now() + 60_000),
  })
  await assert.doesNotReject(() => post.validate(), 'valid post should pass validation')
})

test('ScheduledPost fails validation with an invalid target.status', async () => {
  const wsId   = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  const post = new ScheduledPost({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://example.com/video.mp4',
    title:       'My video',
    caption:     'Check this out!',
    targets:     [{ platform: 'youtube', status: 'INVALID_STATUS' }],
    scheduledAt: new Date(Date.now() + 60_000),
  })
  let threw = false
  try { await post.validate() } catch (err) {
    threw = true
    assert.ok(err.name === 'ValidationError' || /validation failed/i.test(err.message),
      `expected ValidationError, got: ${err.message}`)
  }
  assert.ok(threw, 'expected validate() to throw for invalid target.status')
})

test('ScheduledPost fails validation with an invalid top-level status', async () => {
  const wsId   = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()
  const post = new ScheduledPost({
    workspaceId: wsId,
    createdBy:   userId,
    videoUrl:    'https://example.com/video.mp4',
    targets:     [],
    scheduledAt: new Date(Date.now() + 60_000),
    status:      'not-a-valid-status',
  })
  let threw = false
  try { await post.validate() } catch (err) {
    threw = true
    assert.ok(err.name === 'ValidationError' || /validation failed/i.test(err.message),
      `expected ValidationError, got: ${err.message}`)
  }
  assert.ok(threw, 'expected validate() to throw for invalid post status')
})
