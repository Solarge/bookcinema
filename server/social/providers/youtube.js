/**
 * YouTube social provider — Google OAuth 2.0 + YouTube Data API v3.
 *
 * Required env vars:
 *   YOUTUBE_CLIENT_ID      — Google OAuth2 client ID
 *   YOUTUBE_CLIENT_SECRET  — Google OAuth2 client secret
 *
 * Scopes requested:
 *   https://www.googleapis.com/auth/youtube.upload   — upload videos
 *   https://www.googleapis.com/auth/youtube.readonly  — read channel info
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
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
  scopes:    [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
}

export function isConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
}

/**
 * Build the Google OAuth2 authorization URL.
 * Uses access_type=offline + prompt=consent to receive a refresh token every time.
 *
 * @param {{ redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('YouTube not configured')
  const params = qs({
    client_id:     process.env.YOUTUBE_CLIENT_ID,
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
 * @param {{ code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('YouTube not configured')

  const tokenData = await postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id:     process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
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
 * @param {{ refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('YouTube not configured')

  const tokenData = await postForm(GOOGLE_TOKEN_URL, {
    client_id:     process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
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
  if (!isConfigured()) throw new Error('YouTube not configured')

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
