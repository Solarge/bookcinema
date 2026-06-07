/**
 * Facebook social provider — Meta Graph API (Facebook Pages).
 *
 * Per-workspace credentials (creds object keys):
 *   app_id      — Meta developer app ID
 *   app_secret  — Meta developer app secret
 *
 * Scopes requested:
 *   pages_manage_posts    — create posts and videos on Pages
 *   pages_read_engagement — read Page info / engagement stats
 *   pages_show_list       — enumerate Pages the user manages
 *
 * Publish flow:
 *   1. GET /me/accounts  → page access token + page id (stored in tokens)
 *   2. POST to graph-video.facebook.com/{version}/{page-id}/videos
 *      with file_url (S3 URL), description (caption), access_token (page token)
 *
 * Meta Graph API reference:
 *   https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *   https://developers.facebook.com/docs/graph-api/reference/page/videos
 *
 * Credentials are supplied per-workspace (decrypted from SocialAppCredential)
 * and passed into getAuthUrl/exchangeCode/refresh as `creds`.
 */

import { postForm, fetchJson, qs, expiresAt } from './_util.js'

const META_GRAPH_VERSION = 'v20.0'
const META_AUTH_URL      = 'https://www.facebook.com'
const META_GRAPH_URL     = 'https://graph.facebook.com'
const META_VIDEO_URL     = 'https://graph-video.facebook.com'

const AUTH_DIALOG        = `${META_AUTH_URL}/${META_GRAPH_VERSION}/dialog/oauth`
const TOKEN_URL          = `${META_GRAPH_URL}/${META_GRAPH_VERSION}/oauth/access_token`
const LONG_TOKEN_URL     = `${META_GRAPH_URL}/oauth/access_token`

export const meta = {
  key:       'facebook',
  label:     'Facebook',
  configEnv: ['META_APP_ID', 'META_APP_SECRET'],
  credentialFields: [
    { key: 'app_id',     label: 'Meta App ID' },
    { key: 'app_secret', label: 'Meta App Secret', secret: true },
  ],
  scopes:    ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
}

/** Credential keys the tenant must supply for this platform. */
export function requiredKeys() {
  return meta.credentialFields.map(f => f.key)
}

/**
 * Build the Meta (Facebook) OAuth dialog URL.
 *
 * @param {{ creds: { app_id: string, app_secret: string }, redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ creds, redirectUri, state }) {
  if (!creds) throw new Error('Facebook not configured')
  const params = qs({
    client_id:     creds.app_id,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         meta.scopes.join(','),
    state,
  })
  return `${AUTH_DIALOG}?${params}`
}

/**
 * Exchange an authorization code for tokens.
 * Fetches the /me/accounts list to find the first managed Page.
 * Stores the Page access token (long-lived) in accessToken.
 *
 * @param {{ creds: { app_id: string, app_secret: string }, code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: null, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ creds, code, redirectUri }) {
  if (!creds) throw new Error('Facebook not configured')

  // Step 1 — short-lived user token
  const shortToken = await postForm(TOKEN_URL, {
    client_id:     creds.app_id,
    client_secret: creds.app_secret,
    redirect_uri:  redirectUri,
    code,
    grant_type:    'authorization_code',
  })

  // Step 2 — extend to long-lived user token (~60 days)
  const longToken = await fetchJson(
    `${LONG_TOKEN_URL}?${qs({
      grant_type:        'fb_exchange_token',
      client_id:         creds.app_id,
      client_secret:     creds.app_secret,
      fb_exchange_token: shortToken.access_token,
    })}`,
    shortToken.access_token,
  )

  const userToken   = longToken.access_token ?? shortToken.access_token
  const tokenExpiry = longToken.expires_in   ?? 5183944 // ~60 days

  // Step 3 — find the first managed Page + its never-expiring page access token
  const pagesRes = await fetchJson(
    `${META_GRAPH_URL}/${META_GRAPH_VERSION}/me/accounts?${qs({ fields: 'id,name,access_token' })}`,
    userToken,
  )
  const page       = pagesRes?.data?.[0] ?? {}
  const pageToken  = page.access_token ?? userToken

  return {
    account: {
      externalId:  page.id   ?? '',
      displayName: page.name ?? '',
      scopes:      meta.scopes,
    },
    tokens: {
      accessToken:  pageToken,
      refreshToken: null,   // Page tokens don't expire; user token exchange used for refresh
      expiresAt:    expiresAt(tokenExpiry),
    },
  }
}

/**
 * Refresh a Meta long-lived token.
 * Meta Page access tokens typically never expire, but user tokens can be refreshed.
 *
 * @param {{ creds: { app_id: string, app_secret: string }, refreshToken: string | null }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: null, expiresAt: Date }>}
 */
export async function refresh({ creds, refreshToken }) {
  if (!creds) throw new Error('Facebook not configured')

  const currentToken = refreshToken
  const data = await fetchJson(
    `${META_GRAPH_URL}/oauth/access_token?${qs({
      grant_type:        'fb_exchange_token',
      client_id:         creds.app_id,
      client_secret:     creds.app_secret,
      fb_exchange_token: currentToken,
    })}`,
    currentToken,
  )

  return {
    accessToken:  data.access_token,
    refreshToken: null,
    expiresAt:    expiresAt(data.expires_in ?? 5183944),
  }
}

/**
 * Publish a video to a Facebook Page using the video upload API.
 *
 * The tokens object must include:
 *   accessToken  — Page access token (stored from exchangeCode)
 *   pageId       — Facebook Page ID (stored from exchangeCode as externalId)
 *
 * LIVE-VERIFY: requires pages_manage_posts permission and the Meta app to be
 * approved for Page video publishing (may require Business Verification).
 *
 * @param {{
 *   tokens:   { accessToken: string, pageId?: string },
 *   videoUrl: string,
 *   caption:  string,
 *   title:    string
 * }} opts
 * @returns {Promise<{ externalId: string, url: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption, title }) {
  const { accessToken } = tokens

  // Resolve pageId — callers store this from exchangeCode (as account.externalId)
  let pageId = tokens.pageId
  if (!pageId) {
    const pagesRes = await fetchJson(
      `${META_GRAPH_URL}/${META_GRAPH_VERSION}/me/accounts?${qs({ fields: 'id' })}`,
      accessToken,
    )
    pageId = pagesRes?.data?.[0]?.id
    if (!pageId) throw new Error('Facebook: no managed Page found on this account')
  }

  const uploadUrl = `${META_VIDEO_URL}/${META_GRAPH_VERSION}/${pageId}/videos`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_url:     videoUrl,
      description:  caption ?? '',
      title:        title   ?? '',
      // access_token is included in the Authorization header above;
      // some Meta endpoints also accept it in the body — include both for safety
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Facebook video publish failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  const videoId = data.id ?? ''

  return {
    externalId: videoId,
    url:        `https://www.facebook.com/video/${videoId}`,
  }
}
