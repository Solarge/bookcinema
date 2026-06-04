/**
 * Unit tests for the six social platform adapter modules.
 *
 * Strategy: env vars are set/deleted per-test; fetch is monkey-patched to
 * avoid real network calls.  We test:
 *   1. isConfigured() responds correctly to env presence/absence.
 *   2. getAuthUrl() returns a correctly-composed OAuth URL.
 *   3. publishVideo() throws "not configured" when env is absent.
 *
 * Tests do NOT exercise exchangeCode / refresh — those require full round-trip
 * network mocks and are covered by the social-oauth integration tests.
 */

import './helpers/env.js'
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// --- adapters ---
import * as youtube   from '../social/providers/youtube.js'
import * as tiktok    from '../social/providers/tiktok.js'
import * as instagram from '../social/providers/instagram.js'
import * as facebook  from '../social/providers/facebook.js'
import * as x         from '../social/providers/x.js'
import * as linkedin  from '../social/providers/linkedin.js'

// ── helpers ────────────────────────────────────────────────────────────────

const realFetch = globalThis.fetch

/** Capture + restore process.env keys between tests. */
const ENV_KEYS = [
  'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET',
  'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
  'META_APP_ID', 'META_APP_SECRET',
  'X_CLIENT_ID', 'X_CLIENT_SECRET', 'TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET',
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET',
]

let savedEnv = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = savedEnv[k]
    }
  }
  globalThis.fetch = realFetch
})

const CB   = 'https://app.example/cb'
const ST   = 'STATE123'

// ── YouTube ────────────────────────────────────────────────────────────────

test('youtube: isConfigured() true when both env vars are set', () => {
  process.env.YOUTUBE_CLIENT_ID     = 'yt-id'
  process.env.YOUTUBE_CLIENT_SECRET = 'yt-sec'
  assert.equal(youtube.isConfigured(), true)
})

test('youtube: isConfigured() false when env vars are absent', () => {
  assert.equal(youtube.isConfigured(), false)
})

test('youtube: isConfigured() false when only one var is set', () => {
  process.env.YOUTUBE_CLIENT_ID = 'yt-id'
  assert.equal(youtube.isConfigured(), false)
})

test('youtube: getAuthUrl returns a correctly-composed Google OAuth URL', () => {
  process.env.YOUTUBE_CLIENT_ID     = 'yt-id'
  process.env.YOUTUBE_CLIENT_SECRET = 'yt-sec'
  const url = youtube.getAuthUrl({ redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), `URL starts with Google auth host: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('client_id'),              'URL contains client_id param')
  assert.ok(url.includes(encodeURIComponent(CB)),   'URL contains encoded redirect_uri')
  assert.ok(url.includes('access_type'),            'URL contains access_type (offline)')
})

test('youtube: getAuthUrl throws when not configured', () => {
  assert.throws(() => youtube.getAuthUrl({ redirectUri: CB, state: ST }), /YouTube not configured/)
})

test('youtube: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => youtube.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x', title: 'y' }),
    /YouTube not configured/,
  )
})

// ── TikTok ─────────────────────────────────────────────────────────────────

test('tiktok: isConfigured() true when both env vars are set', () => {
  process.env.TIKTOK_CLIENT_KEY    = 'tt-key'
  process.env.TIKTOK_CLIENT_SECRET = 'tt-sec'
  assert.equal(tiktok.isConfigured(), true)
})

test('tiktok: isConfigured() false when env vars are absent', () => {
  assert.equal(tiktok.isConfigured(), false)
})

test('tiktok: getAuthUrl returns a correctly-composed TikTok OAuth URL', () => {
  process.env.TIKTOK_CLIENT_KEY    = 'tt-key'
  process.env.TIKTOK_CLIENT_SECRET = 'tt-sec'
  const url = tiktok.getAuthUrl({ redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.tiktok.com/v2/auth/authorize'), `URL starts with TikTok auth host: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('client_key'),             'URL contains client_key param')
  assert.ok(url.includes(encodeURIComponent(CB)),   'URL contains encoded redirect_uri')
})

test('tiktok: getAuthUrl throws when not configured', () => {
  assert.throws(() => tiktok.getAuthUrl({ redirectUri: CB, state: ST }), /TikTok not configured/)
})

test('tiktok: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => tiktok.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x' }),
    /TikTok not configured/,
  )
})

// ── Instagram ──────────────────────────────────────────────────────────────

test('instagram: isConfigured() true when META_APP_ID and META_APP_SECRET are set', () => {
  process.env.META_APP_ID     = 'meta-id'
  process.env.META_APP_SECRET = 'meta-sec'
  assert.equal(instagram.isConfigured(), true)
})

test('instagram: isConfigured() false when env vars are absent', () => {
  assert.equal(instagram.isConfigured(), false)
})

test('instagram: getAuthUrl returns a correctly-composed Meta OAuth dialog URL', () => {
  process.env.META_APP_ID     = 'meta-id'
  process.env.META_APP_SECRET = 'meta-sec'
  const url = instagram.getAuthUrl({ redirectUri: CB, state: ST })
  // AUTH_DIALOG = https://www.facebook.com/v20.0/dialog/oauth
  assert.ok(url.startsWith('https://www.facebook.com/'), `URL starts with facebook.com: ${url}`)
  assert.ok(url.includes('/dialog/oauth'),              'URL contains /dialog/oauth')
  assert.ok(url.includes(ST),                           'URL contains state')
  assert.ok(url.includes('client_id'),                  'URL contains client_id param')
  assert.ok(url.includes(encodeURIComponent(CB)),        'URL contains encoded redirect_uri')
})

test('instagram: getAuthUrl throws when not configured', () => {
  assert.throws(() => instagram.getAuthUrl({ redirectUri: CB, state: ST }), /Instagram not configured/)
})

test('instagram: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => instagram.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x' }),
    /Instagram not configured/,
  )
})

// ── Facebook ───────────────────────────────────────────────────────────────

test('facebook: isConfigured() true when META_APP_ID and META_APP_SECRET are set', () => {
  process.env.META_APP_ID     = 'meta-id'
  process.env.META_APP_SECRET = 'meta-sec'
  assert.equal(facebook.isConfigured(), true)
})

test('facebook: isConfigured() false when env vars are absent', () => {
  assert.equal(facebook.isConfigured(), false)
})

test('facebook: getAuthUrl returns a correctly-composed Meta OAuth dialog URL', () => {
  process.env.META_APP_ID     = 'meta-id'
  process.env.META_APP_SECRET = 'meta-sec'
  const url = facebook.getAuthUrl({ redirectUri: CB, state: ST })
  // AUTH_DIALOG = https://www.facebook.com/v20.0/dialog/oauth
  assert.ok(url.startsWith('https://www.facebook.com/'), `URL starts with facebook.com: ${url}`)
  assert.ok(url.includes('/dialog/oauth'),              'URL contains /dialog/oauth')
  assert.ok(url.includes(ST),                           'URL contains state')
  assert.ok(url.includes('client_id'),                  'URL contains client_id param')
  assert.ok(url.includes(encodeURIComponent(CB)),        'URL contains encoded redirect_uri')
})

test('facebook: getAuthUrl throws when not configured', () => {
  assert.throws(() => facebook.getAuthUrl({ redirectUri: CB, state: ST }), /Facebook not configured/)
})

test('facebook: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => facebook.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x', title: 'y' }),
    /Facebook not configured/,
  )
})

// ── X (Twitter) ────────────────────────────────────────────────────────────

test('x: isConfigured() true when X_CLIENT_ID and X_CLIENT_SECRET are set', () => {
  process.env.X_CLIENT_ID     = 'x-id'
  process.env.X_CLIENT_SECRET = 'x-sec'
  assert.equal(x.isConfigured(), true)
})

test('x: isConfigured() true when legacy TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET are set', () => {
  process.env.TWITTER_CLIENT_ID     = 'tw-id'
  process.env.TWITTER_CLIENT_SECRET = 'tw-sec'
  assert.equal(x.isConfigured(), true)
})

test('x: isConfigured() false when all X/Twitter env vars are absent', () => {
  assert.equal(x.isConfigured(), false)
})

test('x: getAuthUrl returns a correctly-composed X OAuth 2.0 PKCE URL', () => {
  process.env.X_CLIENT_ID     = 'x-id'
  process.env.X_CLIENT_SECRET = 'x-sec'
  const url = x.getAuthUrl({ redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://twitter.com/i/oauth2/authorize'), `URL starts with twitter.com auth: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('client_id'),              'URL contains client_id param')
  assert.ok(url.includes(encodeURIComponent(CB)),   'URL contains encoded redirect_uri')
  assert.ok(url.includes('code_challenge'),         'URL contains code_challenge (PKCE)')
})

test('x: getAuthUrl uses legacy TWITTER_CLIENT_ID when X_CLIENT_ID is absent', () => {
  process.env.TWITTER_CLIENT_ID     = 'tw-id'
  process.env.TWITTER_CLIENT_SECRET = 'tw-sec'
  const url = x.getAuthUrl({ redirectUri: CB, state: ST })
  assert.ok(url.includes('tw-id'), 'URL contains the legacy client id value')
})

test('x: getAuthUrl throws when not configured', () => {
  assert.throws(() => x.getAuthUrl({ redirectUri: CB, state: ST }), /X not configured/)
})

test('x: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => x.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x' }),
    /X not configured/,
  )
})

// ── LinkedIn ───────────────────────────────────────────────────────────────

test('linkedin: isConfigured() true when both env vars are set', () => {
  process.env.LINKEDIN_CLIENT_ID     = 'li-id'
  process.env.LINKEDIN_CLIENT_SECRET = 'li-sec'
  assert.equal(linkedin.isConfigured(), true)
})

test('linkedin: isConfigured() false when env vars are absent', () => {
  assert.equal(linkedin.isConfigured(), false)
})

test('linkedin: isConfigured() false when only one var is set', () => {
  process.env.LINKEDIN_CLIENT_ID = 'li-id'
  assert.equal(linkedin.isConfigured(), false)
})

test('linkedin: getAuthUrl returns a correctly-composed LinkedIn OAuth URL', () => {
  process.env.LINKEDIN_CLIENT_ID     = 'li-id'
  process.env.LINKEDIN_CLIENT_SECRET = 'li-sec'
  const url = linkedin.getAuthUrl({ redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.linkedin.com/oauth/v2/authorization'), `URL starts with LinkedIn auth: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('client_id'),              'URL contains client_id param')
  assert.ok(url.includes(encodeURIComponent(CB)),   'URL contains encoded redirect_uri')
})

test('linkedin: getAuthUrl throws when not configured', () => {
  assert.throws(() => linkedin.getAuthUrl({ redirectUri: CB, state: ST }), /LinkedIn not configured/)
})

test('linkedin: publishVideo throws "not configured" when env absent', async () => {
  await assert.rejects(
    () => linkedin.publishVideo({ tokens: { accessToken: 'tok' }, videoUrl: 'http://s3/v.mp4', caption: 'x' }),
    /LinkedIn not configured/,
  )
})
