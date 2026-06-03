/**
 * X (formerly Twitter) social provider — X API v2, OAuth 2.0 PKCE.
 *
 * Required env vars (accepts either name):
 *   X_CLIENT_ID / TWITTER_CLIENT_ID         — X OAuth2 app client ID
 *   X_CLIENT_SECRET / TWITTER_CLIENT_SECRET — X OAuth2 app client secret
 *
 * Scopes requested:
 *   tweet.read     — read tweets
 *   tweet.write    — post tweets
 *   users.read     — read user profile
 *   offline.access — receive a refresh token
 *   media.write    — upload media (requires Elevated/Pro API access)
 *
 * PKCE simplification:
 *   This adapter uses code_challenge_method=plain with the state value as the
 *   code_verifier/challenge. A production implementation should generate a
 *   random verifier per flow and store it (e.g. in the signed state JWT or
 *   session). The plain method is used here to keep the adapter stateless —
 *   the route layer owns state/verifier storage if stricter PKCE is needed.
 *
 * Publish flow (video):
 *   1. Download video bytes from the S3 URL.
 *   2. INIT  — POST to upload.twitter.com/1.1/media/upload.json (INIT command)
 *              → returns media_id_string
 *   3. APPEND — PUT chunks (5 MB max per chunk) with segment_index
 *   4. FINALIZE — POST to finalize, poll if processing_info.state != 'succeeded'
 *   5. POST /2/tweets with text=caption + media.media_ids=[media_id_string]
 *      → returns { id: tweetId }
 *
 * X API v2 references:
 *   OAuth 2.0: https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code
 *   Media upload: https://developer.x.com/en/docs/x-api/v1/media/upload-media/api-reference/post-media-upload
 *   Tweets: https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

import { fetchJson, downloadBytes, qs, expiresAt } from './_util.js'

const X_AUTH_URL    = 'https://twitter.com/i/oauth2/authorize'
const X_TOKEN_URL   = 'https://api.twitter.com/2/oauth2/token'
const X_UPLOAD_URL  = 'https://upload.twitter.com/1.1/media/upload.json'
const X_TWEETS_URL  = 'https://api.twitter.com/2/tweets'
const X_ME_URL      = 'https://api.twitter.com/2/users/me'

const CHUNK_SIZE = 5 * 1024 * 1024   // 5 MB per APPEND segment

/** Resolve the active client ID, preferring new-style env names. */
function clientId()     { return process.env.X_CLIENT_ID     || process.env.TWITTER_CLIENT_ID     }
function clientSecret() { return process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET }

export const meta = {
  key:       'x',
  label:     'X',
  configEnv: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  scopes:    ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
}

export function isConfigured() {
  return !!(clientId() && clientSecret())
}

/**
 * Build the X OAuth 2.0 PKCE authorization URL.
 * Uses code_challenge_method=plain with state as the verifier.
 *
 * @param {{ redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('X not configured')
  const params = qs({
    client_id:             clientId(),
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 meta.scopes.join(' '),
    state,
    code_challenge:        state,        // plain PKCE: challenge == verifier == state
    code_challenge_method: 'plain',
  })
  return `${X_AUTH_URL}?${params}`
}

/**
 * Exchange an authorization code for tokens.
 * The code_verifier must match the code_challenge sent in getAuthUrl.
 *
 * @param {{ code: string, redirectUri: string, codeVerifier?: string, state?: string }} opts
 *   Pass codeVerifier (or state, which equals the verifier with plain PKCE).
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ code, redirectUri, codeVerifier, state }) {
  if (!isConfigured()) throw new Error('X not configured')

  // With plain PKCE the verifier is the state value
  const verifier = codeVerifier ?? state ?? ''

  // X token endpoint requires HTTP Basic auth (client_id:client_secret)
  const basicAuth = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')

  const body = new URLSearchParams({
    code,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
    code_verifier: verifier,
  }).toString()

  const tokenRes = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   `Basic ${basicAuth}`,
    },
    body,
  })
  const tokenText = await tokenRes.text()
  let tokenData
  try { tokenData = JSON.parse(tokenText) } catch { tokenData = { _raw: tokenText } }
  if (!tokenRes.ok) throw new Error(`X token exchange failed ${tokenRes.status}: ${JSON.stringify(tokenData)}`)

  const { access_token, refresh_token, expires_in } = tokenData

  // Fetch user info
  const userRes = await fetchJson(`${X_ME_URL}?${qs({ 'user.fields': 'name,username' })}`, access_token)
  const userData    = userRes?.data ?? {}
  const externalId  = userData.id       ?? ''
  const displayName = userData.name     ?? userData.username ?? ''

  return {
    account: { externalId, displayName, scopes: meta.scopes },
    tokens: {
      accessToken:  access_token,
      refreshToken: refresh_token ?? '',
      expiresAt:    expiresAt(expires_in ?? 7200),
    },
  }
}

/**
 * Refresh an X access token.
 *
 * @param {{ refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('X not configured')

  const basicAuth = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  }).toString()

  const tokenRes = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   `Basic ${basicAuth}`,
    },
    body,
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(`X token refresh failed ${tokenRes.status}: ${JSON.stringify(tokenData)}`)

  return {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? refreshToken,
    expiresAt:    expiresAt(tokenData.expires_in ?? 7200),
  }
}

/**
 * Publish a video tweet via X API.
 *
 * Uses the v1.1 chunked media upload endpoint (INIT/APPEND/FINALIZE) followed
 * by the v2 /tweets endpoint. Requires Elevated or Pro API access.
 *
 * Chunked upload steps:
 *   INIT     — declare total_bytes + media_type; receive media_id_string
 *   APPEND   — PUT each 5 MB chunk with segment_index 0, 1, 2, …
 *   FINALIZE — commit the upload; poll if processing_info.state is 'in_progress'
 *
 * LIVE-VERIFY: requires a valid access_token with media.write + tweet.write scopes
 * and an X developer app with Elevated or Pro API access tier.
 *
 * @param {{
 *   tokens:   { accessToken: string },
 *   videoUrl: string,
 *   caption:  string
 * }} opts
 * @returns {Promise<{ externalId: string, url: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption }) {
  if (!isConfigured()) throw new Error('X not configured')

  const { accessToken } = tokens

  // Download video bytes from S3
  const { buffer, contentType, contentLength } = await downloadBytes(videoUrl)

  // ---- INIT ----
  const initForm = new URLSearchParams({
    command:      'INIT',
    total_bytes:  String(contentLength),
    media_type:   contentType,
    media_category: 'tweet_video',
  })
  const initRes = await fetch(X_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: initForm.toString(),
  })
  if (!initRes.ok) {
    const text = await initRes.text()
    throw new Error(`X media INIT failed ${initRes.status}: ${text}`)
  }
  const { media_id_string: mediaId } = await initRes.json()

  // ---- APPEND ----
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE)
  for (let i = 0; i < totalChunks; i++) {
    const chunk = buffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const form  = new FormData()
    form.append('command',       'APPEND')
    form.append('media_id',      mediaId)
    form.append('segment_index', String(i))
    form.append('media',         new Blob([chunk], { type: contentType }))

    const appendRes = await fetch(X_UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    form,
    })
    if (!appendRes.ok && appendRes.status !== 204) {
      const text = await appendRes.text()
      throw new Error(`X media APPEND chunk ${i} failed ${appendRes.status}: ${text}`)
    }
  }

  // ---- FINALIZE ----
  const finalizeForm = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId })
  const finalizeRes = await fetch(X_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: finalizeForm.toString(),
  })
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text()
    throw new Error(`X media FINALIZE failed ${finalizeRes.status}: ${text}`)
  }
  let finalizeData = await finalizeRes.json()

  // Poll if the video is still being processed
  while (finalizeData?.processing_info?.state === 'in_progress') {
    const checkAfterSecs = finalizeData.processing_info.check_after_secs ?? 5
    await new Promise(r => setTimeout(r, checkAfterSecs * 1000))
    const statusRes = await fetch(
      `${X_UPLOAD_URL}?${qs({ command: 'STATUS', media_id: mediaId })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!statusRes.ok) {
      const text = await statusRes.text()
      throw new Error(`X media STATUS check failed ${statusRes.status}: ${text}`)
    }
    finalizeData = await statusRes.json()
    if (finalizeData?.processing_info?.state === 'failed') {
      throw new Error(`X media processing failed for media_id: ${mediaId}`)
    }
  }

  // ---- POST TWEET ----
  const tweetRes = await fetch(X_TWEETS_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text:  caption ?? '',
      media: { media_ids: [mediaId] },
    }),
  })
  if (!tweetRes.ok) {
    const text = await tweetRes.text()
    throw new Error(`X tweet post failed ${tweetRes.status}: ${text}`)
  }
  const tweetData = await tweetRes.json()
  const tweetId   = tweetData?.data?.id ?? ''

  // Fetch the author's username to build the URL
  const meRes      = await fetchJson(`${X_ME_URL}?${qs({ 'user.fields': 'username' })}`, accessToken)
  const username   = meRes?.data?.username ?? 'i'

  return {
    externalId: tweetId,
    url:        `https://x.com/${username}/status/${tweetId}`,
  }
}
