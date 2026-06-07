/**
 * Unit tests for the six social platform adapter modules.
 *
 * Strategy: credentials are passed per-call as a `creds` object (per-workspace
 * model — there is NO global env app). We test:
 *   1. requiredKeys()/credentialFields describe the expected per-platform keys.
 *   2. getAuthUrl({ creds }) returns a correctly-composed OAuth URL using creds.
 *   3. getAuthUrl()/publishVideo throw "not configured" when creds are absent.
 *
 * exchangeCode / refresh require full round-trip network mocks and are covered
 * by social-oauth + social-scheduling, plus a stubbed-fetch unit test below.
 */

import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// --- adapters ---
import * as youtube   from '../social/providers/youtube.js'
import * as tiktok    from '../social/providers/tiktok.js'
import * as instagram from '../social/providers/instagram.js'
import * as facebook  from '../social/providers/facebook.js'
import * as x         from '../social/providers/x.js'
import * as linkedin  from '../social/providers/linkedin.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const CB = 'https://app.example/cb'
const ST = 'STATE123'

// Per-platform creds keyed by each provider's credentialFields keys.
const CREDS = {
  youtube:   { client_id: 'yt-id',  client_secret: 'yt-sec'  },
  tiktok:    { client_key: 'tt-key', client_secret: 'tt-sec' },
  instagram: { app_id: 'meta-id',   app_secret: 'meta-sec'   },
  facebook:  { app_id: 'meta-id',   app_secret: 'meta-sec'   },
  x:         { client_id: 'x-id',   client_secret: 'x-sec'   },
  linkedin:  { client_id: 'li-id',  client_secret: 'li-sec'  },
}

// ── requiredKeys / credentialFields ─────────────────────────────────────────

const ADAPTERS = { youtube, tiktok, instagram, facebook, x, linkedin }

test('every adapter exposes requiredKeys() matching its credentialFields', () => {
  for (const [name, mod] of Object.entries(ADAPTERS)) {
    assert.equal(typeof mod.requiredKeys, 'function', `${name}: requiredKeys is a function`)
    const fields = mod.meta.credentialFields
    assert.ok(Array.isArray(fields) && fields.length >= 2, `${name}: credentialFields present`)
    assert.deepEqual(mod.requiredKeys(), fields.map(f => f.key), `${name}: requiredKeys == field keys`)
  }
})

test('credentialFields keys are exactly as specified per platform', () => {
  assert.deepEqual(youtube.requiredKeys(),   ['client_id', 'client_secret'])
  assert.deepEqual(tiktok.requiredKeys(),    ['client_key', 'client_secret'])
  assert.deepEqual(instagram.requiredKeys(), ['app_id', 'app_secret'])
  assert.deepEqual(facebook.requiredKeys(),  ['app_id', 'app_secret'])
  assert.deepEqual(x.requiredKeys(),         ['client_id', 'client_secret'])
  assert.deepEqual(linkedin.requiredKeys(),  ['client_id', 'client_secret'])
})

// ── YouTube ────────────────────────────────────────────────────────────────

test('youtube: getAuthUrl returns a correctly-composed Google OAuth URL from creds', () => {
  const url = youtube.getAuthUrl({ creds: CREDS.youtube, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), `URL starts with Google auth host: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('yt-id'),                 'URL contains creds client_id')
  assert.ok(url.includes(encodeURIComponent(CB)),  'URL contains encoded redirect_uri')
  assert.ok(url.includes('access_type'),           'URL contains access_type (offline)')
})

test('youtube: getAuthUrl throws when creds absent', () => {
  assert.throws(() => youtube.getAuthUrl({ redirectUri: CB, state: ST }), /YouTube not configured/)
})

// ── TikTok ─────────────────────────────────────────────────────────────────

test('tiktok: getAuthUrl returns a correctly-composed TikTok OAuth URL from creds', () => {
  const url = tiktok.getAuthUrl({ creds: CREDS.tiktok, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.tiktok.com/v2/auth/authorize'), `URL starts with TikTok auth host: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('tt-key'),                'URL contains creds client_key')
  assert.ok(url.includes(encodeURIComponent(CB)),  'URL contains encoded redirect_uri')
})

test('tiktok: getAuthUrl throws when creds absent', () => {
  assert.throws(() => tiktok.getAuthUrl({ redirectUri: CB, state: ST }), /TikTok not configured/)
})

// ── Instagram ──────────────────────────────────────────────────────────────

test('instagram: getAuthUrl returns a correctly-composed Meta OAuth dialog URL from creds', () => {
  const url = instagram.getAuthUrl({ creds: CREDS.instagram, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.facebook.com/'), `URL starts with facebook.com: ${url}`)
  assert.ok(url.includes('/dialog/oauth'),              'URL contains /dialog/oauth')
  assert.ok(url.includes(ST),                           'URL contains state')
  assert.ok(url.includes('meta-id'),                    'URL contains creds app_id')
  assert.ok(url.includes(encodeURIComponent(CB)),        'URL contains encoded redirect_uri')
})

test('instagram: getAuthUrl throws when creds absent', () => {
  assert.throws(() => instagram.getAuthUrl({ redirectUri: CB, state: ST }), /Instagram not configured/)
})

// ── Facebook ───────────────────────────────────────────────────────────────

test('facebook: getAuthUrl returns a correctly-composed Meta OAuth dialog URL from creds', () => {
  const url = facebook.getAuthUrl({ creds: CREDS.facebook, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.facebook.com/'), `URL starts with facebook.com: ${url}`)
  assert.ok(url.includes('/dialog/oauth'),              'URL contains /dialog/oauth')
  assert.ok(url.includes(ST),                           'URL contains state')
  assert.ok(url.includes('meta-id'),                    'URL contains creds app_id')
  assert.ok(url.includes(encodeURIComponent(CB)),        'URL contains encoded redirect_uri')
})

test('facebook: getAuthUrl throws when creds absent', () => {
  assert.throws(() => facebook.getAuthUrl({ redirectUri: CB, state: ST }), /Facebook not configured/)
})

// ── X (Twitter) ────────────────────────────────────────────────────────────

test('x: getAuthUrl returns a correctly-composed X OAuth 2.0 PKCE URL from creds', () => {
  const url = x.getAuthUrl({ creds: CREDS.x, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://twitter.com/i/oauth2/authorize'), `URL starts with twitter.com auth: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('x-id'),                  'URL contains creds client_id')
  assert.ok(url.includes(encodeURIComponent(CB)),  'URL contains encoded redirect_uri')
  assert.ok(url.includes('code_challenge'),        'URL contains code_challenge (PKCE)')
})

test('x: getAuthUrl throws when creds absent', () => {
  assert.throws(() => x.getAuthUrl({ redirectUri: CB, state: ST }), /X not configured/)
})

// ── LinkedIn ───────────────────────────────────────────────────────────────

test('linkedin: getAuthUrl returns a correctly-composed LinkedIn OAuth URL from creds', () => {
  const url = linkedin.getAuthUrl({ creds: CREDS.linkedin, redirectUri: CB, state: ST })
  assert.ok(url.startsWith('https://www.linkedin.com/oauth/v2/authorization'), `URL starts with LinkedIn auth: ${url}`)
  assert.ok(url.includes(ST),                      'URL contains state')
  assert.ok(url.includes('li-id'),                 'URL contains creds client_id')
  assert.ok(url.includes(encodeURIComponent(CB)),  'URL contains encoded redirect_uri')
})

test('linkedin: getAuthUrl throws when creds absent', () => {
  assert.throws(() => linkedin.getAuthUrl({ redirectUri: CB, state: ST }), /LinkedIn not configured/)
})

// ── exchangeCode / refresh use creds (stubbed fetch) ─────────────────────────

test('youtube: exchangeCode uses creds.client_id/secret in the token POST (stubbed fetch)', async () => {
  let capturedBody = ''
  let tokenCallCount = 0
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      tokenCallCount++
      capturedBody = opts.body || ''
      return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    // channels lookup
    return new Response(JSON.stringify({ items: [{ id: 'chan1', snippet: { title: 'My Channel' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const result = await youtube.exchangeCode({ creds: CREDS.youtube, code: 'CODE', redirectUri: CB })
  assert.equal(tokenCallCount, 1, 'token endpoint hit once')
  assert.ok(capturedBody.includes('yt-id'),  'token body carries creds client_id')
  assert.ok(capturedBody.includes('yt-sec'), 'token body carries creds client_secret')
  assert.equal(result.tokens.accessToken, 'AT')
  assert.equal(result.account.displayName, 'My Channel')
})

test('youtube: refresh uses creds in the refresh POST (stubbed fetch)', async () => {
  let capturedBody = ''
  globalThis.fetch = async (url, opts = {}) => {
    capturedBody = opts.body || ''
    return new Response(JSON.stringify({ access_token: 'NEW_AT', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await youtube.refresh({ creds: CREDS.youtube, refreshToken: 'OLD_RT' })
  assert.ok(capturedBody.includes('yt-id'),  'refresh body carries creds client_id')
  assert.ok(capturedBody.includes('OLD_RT'), 'refresh body carries refresh token')
  assert.equal(result.accessToken, 'NEW_AT')
})

test('youtube: exchangeCode/refresh throw without creds', async () => {
  await assert.rejects(() => youtube.exchangeCode({ code: 'c', redirectUri: CB }), /not configured/)
  await assert.rejects(() => youtube.refresh({ refreshToken: 'r' }), /not configured/)
})
