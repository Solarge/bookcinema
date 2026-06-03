/**
 * TikTok social provider — TikTok OAuth 2.0 + Content Posting API.
 *
 * Required env vars:
 *   TIKTOK_CLIENT_KEY     — TikTok developer app client key
 *   TIKTOK_CLIENT_SECRET  — TikTok developer app client secret
 *
 * Scopes requested:
 *   user.info.basic    — read user identity (openid is implicit)
 *   video.upload       — upload videos
 *   video.publish      — publish uploaded videos
 *
 * TikTok OAuth 2.0 reference:
 *   https://developers.tiktok.com/doc/oauth-user-access-token-management
 *
 * Content Posting API reference (PULL_FROM_URL):
 *   https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

import { postForm, fetchJson, qs, expiresAt } from './_util.js'

const TIKTOK_AUTH_URL  = 'https://www.tiktok.com/v2/auth/authorize'
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_USER_URL  = 'https://open.tiktokapis.com/v2/user/info/'
const TIKTOK_POST_URL  = 'https://open.tiktokapis.com/v2/post/publish/video/init/'

export const meta = {
  key:       'tiktok',
  label:     'TikTok',
  configEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  scopes:    ['user.info.basic', 'video.upload', 'video.publish'],
}

export function isConfigured() {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
}

/**
 * Build the TikTok OAuth 2.0 authorization URL.
 *
 * @param {{ redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('TikTok not configured')
  const params = qs({
    client_key:    process.env.TIKTOK_CLIENT_KEY,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         meta.scopes.join(','),
    state,
  })
  return `${TIKTOK_AUTH_URL}?${params}`
}

/**
 * Exchange an authorization code for tokens and fetch creator info.
 *
 * @param {{ code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('TikTok not configured')

  const tokenData = await postForm(TIKTOK_TOKEN_URL, {
    code,
    client_key:    process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
  })

  const { access_token, refresh_token, expires_in, open_id } = tokenData

  // Fetch creator display name
  const userRes = await fetchJson(
    `${TIKTOK_USER_URL}?${qs({ fields: 'open_id,display_name' })}`,
    access_token,
  )
  const userData    = userRes?.data?.user ?? {}
  const externalId  = userData.open_id  ?? open_id ?? ''
  const displayName = userData.display_name ?? ''

  return {
    account: { externalId, displayName, scopes: meta.scopes },
    tokens: {
      accessToken:  access_token,
      refreshToken: refresh_token,
      expiresAt:    expiresAt(expires_in ?? 86400),
    },
  }
}

/**
 * Refresh a TikTok access token.
 *
 * @param {{ refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('TikTok not configured')

  const tokenData = await postForm(TIKTOK_TOKEN_URL, {
    client_key:    process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  })

  return {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? refreshToken,
    expiresAt:    expiresAt(tokenData.expires_in ?? 86400),
  }
}

/**
 * Publish a video to TikTok using the Content Posting API (PULL_FROM_URL).
 *
 * TikTok fetches the video from the provided S3 URL directly — no byte upload needed.
 * The returned publish_id is a processing handle; the actual post_id is available
 * later by polling the /v2/post/publish/status/fetch/ endpoint (not implemented here).
 *
 * Note: the account must have an approved Content Posting API access level.
 *
 * LIVE-VERIFY: requires a valid access_token with video.publish scope and
 * app-level Content Posting API approval from TikTok.
 *
 * @param {{ tokens: { accessToken: string }, videoUrl: string, caption: string }} opts
 * @returns {Promise<{ externalId: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption }) {
  if (!isConfigured()) throw new Error('TikTok not configured')

  const { accessToken } = tokens

  const res = await fetch(TIKTOK_POST_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:            caption ?? '',
        privacy_level:    'PUBLIC_TO_EVERYONE',
        disable_duet:     false,
        disable_comment:  false,
        disable_stitch:   false,
      },
      source_info: {
        source:           'PULL_FROM_URL',
        video_url:        videoUrl,
        video_cover_timestamp_ms: 1000,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TikTok publish failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  const publish_id = data?.data?.publish_id ?? ''

  return { externalId: publish_id }
}
