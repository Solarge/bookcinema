/**
 * TikTok social provider — TikTok OAuth 2.0 + Content Posting API.
 *
 * Per-workspace credentials (creds object keys):
 *   client_key     — TikTok developer app client key
 *   client_secret  — TikTok developer app client secret
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
 * Credentials are supplied per-workspace (decrypted from SocialAppCredential)
 * and passed into getAuthUrl/exchangeCode/refresh as `creds`.
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
  credentialFields: [
    { key: 'client_key',    label: 'Client Key' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
  ],
  scopes:    ['user.info.basic', 'video.upload', 'video.publish'],
}

/** Credential keys the tenant must supply for this platform. */
export function requiredKeys() {
  return meta.credentialFields.map(f => f.key)
}

/**
 * Build the TikTok OAuth 2.0 authorization URL.
 *
 * @param {{ creds: { client_key: string, client_secret: string }, redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ creds, redirectUri, state }) {
  if (!creds) throw new Error('TikTok not configured')
  const params = qs({
    client_key:    creds.client_key,
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
 * @param {{ creds: { client_key: string, client_secret: string }, code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ creds, code, redirectUri }) {
  if (!creds) throw new Error('TikTok not configured')

  const tokenData = await postForm(TIKTOK_TOKEN_URL, {
    code,
    client_key:    creds.client_key,
    client_secret: creds.client_secret,
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
 * @param {{ creds: { client_key: string, client_secret: string }, refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ creds, refreshToken }) {
  if (!creds) throw new Error('TikTok not configured')

  const tokenData = await postForm(TIKTOK_TOKEN_URL, {
    client_key:    creds.client_key,
    client_secret: creds.client_secret,
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
