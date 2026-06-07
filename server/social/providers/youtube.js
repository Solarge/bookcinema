/**
 * YouTube social provider — Google OAuth 2.0 + YouTube Data API v3.
 *
 * Per-workspace credentials (creds object keys):
 *   client_id      — Google OAuth2 client ID
 *   client_secret  — Google OAuth2 client secret
 *
 * Scopes requested:
 *   https://www.googleapis.com/auth/youtube.upload   — upload videos
 *   https://www.googleapis.com/auth/youtube.readonly  — read channel info
 *
 * Credentials are supplied per-workspace (decrypted from SocialAppCredential)
 * and passed into getAuthUrl/exchangeCode/refresh as `creds`. There is no
 * global/env app — each tenant configures their own Google OAuth app.
 */

import { postForm, fetchJson, downloadBytes, qs, expiresAt } from './_util.js'

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const YT_CHANNELS_URL  = 'https://www.googleapis.com/youtube/v3/channels'
const YT_UPLOAD_URL    = 'https://www.googleapis.com/upload/youtube/v3/videos'

export const meta = {
  key:       'youtube',
  label:     'YouTube',
  configEnv: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  credentialFields: [
    { key: 'client_id',     label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
  ],
  scopes:    [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
}

/** Credential keys the tenant must supply for this platform. */
export function requiredKeys() {
  return meta.credentialFields.map(f => f.key)
}

/**
 * Build the Google OAuth2 authorization URL.
 * Uses access_type=offline + prompt=consent to receive a refresh token every time.
 *
 * @param {{ creds: { client_id: string, client_secret: string }, redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ creds, redirectUri, state }) {
  if (!creds) throw new Error('YouTube not configured')
  const params = qs({
    client_id:     creds.client_id,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         meta.scopes.join(' '),
    state,
    access_type:   'offline',
    prompt:        'consent',   // force refresh_token to be issued each time
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

/**
 * Exchange an authorization code for tokens and fetch channel info.
 *
 * @param {{ creds: { client_id: string, client_secret: string }, code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ creds, code, redirectUri }) {
  if (!creds) throw new Error('YouTube not configured')

  const tokenData = await postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
  })

  const { access_token, refresh_token, expires_in } = tokenData

  // Fetch the user's YouTube channel for displayName / externalId
  const channelsRes = await fetchJson(
    `${YT_CHANNELS_URL}?${qs({ part: 'snippet', mine: 'true' })}`,
    access_token,
  )
  const channel = channelsRes?.items?.[0]
  const externalId   = channel?.id ?? ''
  const displayName  = channel?.snippet?.title ?? ''

  return {
    account: { externalId, displayName, scopes: meta.scopes },
    tokens: {
      accessToken:  access_token,
      refreshToken: refresh_token,
      expiresAt:    expiresAt(expires_in ?? 3600),
    },
  }
}

/**
 * Refresh an access token using a stored refresh token.
 *
 * @param {{ creds: { client_id: string, client_secret: string }, refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ creds, refreshToken }) {
  if (!creds) throw new Error('YouTube not configured')

  const tokenData = await postForm(GOOGLE_TOKEN_URL, {
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  })

  return {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? refreshToken, // Google may not re-issue it
    expiresAt:    expiresAt(tokenData.expires_in ?? 3600),
  }
}

/**
 * Upload a video to YouTube using the resumable upload protocol.
 *
 * Steps:
 *   1. POST to /upload/youtube/v3/videos?uploadType=resumable  — initialise the upload session.
 *      The Location header in the response is the upload URL.
 *   2. Fetch the S3 video bytes.
 *   3. PUT the raw bytes to the upload URL.
 *   4. Return { externalId: videoId, url: 'https://youtu.be/<id>' }.
 *
 * LIVE-VERIFY: requires a valid access_token with youtube.upload scope.
 * Cannot be integration-tested without real credentials.
 *
 * @param {{ tokens: { accessToken: string }, videoUrl: string, caption: string, title: string }} opts
 * @returns {Promise<{ externalId: string, url: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption, title }) {
  const { accessToken } = tokens

  // Step 1 — Initialise the resumable upload session
  const initRes = await fetch(
    `${YT_UPLOAD_URL}?${qs({ uploadType: 'resumable', part: 'snippet,status' })}`,
    {
      method: 'POST',
      headers: {
        Authorization:          `Bearer ${accessToken}`,
        'Content-Type':         'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title:       title ?? 'Untitled',
          description: caption ?? '',
        },
        status: {
          privacyStatus: 'public',
        },
      }),
    },
  )

  if (!initRes.ok) {
    const text = await initRes.text()
    throw new Error(`YouTube upload init failed ${initRes.status}: ${text}`)
  }

  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) throw new Error('YouTube upload init: no Location header in response')

  // Step 2 — Download the video from S3
  const { buffer, contentType, contentLength } = await downloadBytes(videoUrl)

  // Step 3 — PUT the bytes to the upload URL
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type':   contentType,
      'Content-Length': String(contentLength),
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    const text = await uploadRes.text()
    throw new Error(`YouTube video PUT failed ${uploadRes.status}: ${text}`)
  }

  const data = await uploadRes.json()
  const videoId = data.id

  return {
    externalId: videoId,
    url:        `https://youtu.be/${videoId}`,
  }
}
