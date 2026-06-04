/**
 * Instagram social provider — Meta Graph API (Instagram Business / Creator).
 *
 * Required env vars:
 *   META_APP_ID     — Meta developer app ID (shared with facebook.js)
 *   META_APP_SECRET — Meta developer app secret (shared with facebook.js)
 *
 * Scopes requested:
 *   instagram_basic               — read IG account info
 *   instagram_content_publish     — create posts / Reels
 *   pages_show_list               — enumerate connected Facebook Pages
 *   pages_read_engagement         — needed for Pages API access
 *
 * Prerequisites for publishVideo:
 *   - The authenticated user must have an Instagram Business or Creator account.
 *   - That IG account must be linked to a Facebook Page the user administers.
 *   - The Meta app must have instagram_content_publish approved (may require review).
 *
 * Publish flow (Reels):
 *   1. GET /me/accounts  → page access token + page id
 *   2. GET /{page-id}?fields=instagram_business_account  → ig_user_id
 *   3. POST /{ig_user_id}/media with media_type=REELS, video_url, caption
 *      → returns creation_id (container)
 *   4. Poll GET /{creation_id}?fields=status_code until FINISHED (or ERROR)
 *   5. POST /{ig_user_id}/media_publish with creation_id
 *      → returns media_id (the published Reel)
 *
 * Meta Graph API reference:
 *   https://developers.facebook.com/docs/instagram-api/reference/ig-media
 *   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

import { postForm, fetchJson, qs, expiresAt } from './_util.js'

const META_GRAPH_VERSION = 'v20.0'
const META_AUTH_URL      = 'https://www.facebook.com'
const META_GRAPH_URL     = 'https://graph.facebook.com'

const AUTH_DIALOG        = `${META_AUTH_URL}/${META_GRAPH_VERSION}/dialog/oauth`
const TOKEN_URL          = `${META_GRAPH_URL}/${META_GRAPH_VERSION}/oauth/access_token`
const LONG_TOKEN_URL     = `${META_GRAPH_URL}/oauth/access_token`

export const meta = {
  key:       'instagram',
  label:     'Instagram',
  configEnv: ['META_APP_ID', 'META_APP_SECRET'],
  scopes:    [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ],
}

export function isConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

/**
 * Build the Meta (Facebook) OAuth dialog URL for Instagram.
 *
 * @param {{ redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('Instagram not configured')
  const params = qs({
    client_id:     process.env.META_APP_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         meta.scopes.join(','),
    state,
  })
  return `${AUTH_DIALOG}?${params}`
}

/**
 * Exchange an authorization code for a short-lived user token, then
 * extend it to a long-lived token, and discover the linked IG Business account.
 *
 * @param {{ code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string|null, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('Instagram not configured')

  // Step 1 — short-lived user token
  const shortToken = await postForm(TOKEN_URL, {
    client_id:     process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri:  redirectUri,
    code,
    grant_type:    'authorization_code',
  })

  // Step 2 — exchange for a long-lived token (60 days)
  const longToken = await fetchJson(
    `${LONG_TOKEN_URL}?${qs({
      grant_type:        'fb_exchange_token',
      client_id:         process.env.META_APP_ID,
      client_secret:     process.env.META_APP_SECRET,
      fb_exchange_token: shortToken.access_token,
    })}`,
    shortToken.access_token,
  )

  const accessToken = longToken.access_token ?? shortToken.access_token
  const tokenExpiry = longToken.expires_in ?? 5183944 // ~60 days

  // Step 3 — find the IG Business account linked to a Page
  const pagesRes = await fetchJson(
    `${META_GRAPH_URL}/${META_GRAPH_VERSION}/me/accounts?${qs({ fields: 'id,name,instagram_business_account' })}`,
    accessToken,
  )
  const page      = pagesRes?.data?.[0] ?? {}
  const igAccount = page?.instagram_business_account ?? {}

  const externalId  = igAccount.id  ?? page.id ?? ''
  const displayName = page.name     ?? ''

  return {
    account: { externalId, displayName, scopes: meta.scopes },
    tokens: {
      accessToken,
      refreshToken: null,  // Meta long-lived tokens are refreshed differently (see refresh())
      expiresAt:    expiresAt(tokenExpiry),
    },
  }
}

/**
 * Refresh a Meta long-lived token.
 *
 * Meta does not use a refresh_token grant; instead you exchange the (still-valid)
 * long-lived token for a fresh one via the oauth/access_token?grant_type=fb_exchange_token endpoint.
 *
 * @param {{ refreshToken: string | null, accessToken?: string }} opts
 *   Pass the current accessToken in refreshToken if that's what was stored.
 * @returns {Promise<{ accessToken: string, refreshToken: null, expiresAt: Date }>}
 */
export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('Instagram not configured')

  // refreshToken slot stores the current long-lived token for Meta
  const currentToken = refreshToken
  const data = await fetchJson(
    `${META_GRAPH_URL}/oauth/access_token?${qs({
      grant_type:        'fb_exchange_token',
      client_id:         process.env.META_APP_ID,
      client_secret:     process.env.META_APP_SECRET,
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
 * Publish a Reel to Instagram via the Meta Content Publishing API.
 *
 * The tokens object must include:
 *   accessToken  — user access token with instagram_content_publish scope
 *   igUserId     — Instagram Business/Creator user ID (stored from exchangeCode)
 *
 * LIVE-VERIFY: requires an approved Meta app, an Instagram Business/Creator account
 * linked to a Facebook Page, and instagram_content_publish scope granted.
 *
 * @param {{
 *   tokens:   { accessToken: string, igUserId?: string },
 *   videoUrl: string,
 *   caption:  string
 * }} opts
 * @returns {Promise<{ externalId: string, url: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption }) {
  if (!isConfigured()) throw new Error('Instagram not configured')

  const { accessToken } = tokens

  // Resolve ig_user_id — callers should store this from exchangeCode;
  // fall back to fetching from the accounts endpoint.
  let igUserId = tokens.igUserId
  if (!igUserId) {
    const pagesRes = await fetchJson(
      `${META_GRAPH_URL}/${META_GRAPH_VERSION}/me/accounts?${qs({ fields: 'id,instagram_business_account' })}`,
      accessToken,
    )
    igUserId = pagesRes?.data?.[0]?.instagram_business_account?.id
    if (!igUserId) throw new Error('Instagram: no linked IG Business account found')
  }

  const base = `${META_GRAPH_URL}/${META_GRAPH_VERSION}`

  // Step 1 — Create the Reel container
  const containerRes = await fetch(`${base}/${igUserId}/media`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url:  videoUrl,
      caption:    caption ?? '',
    }),
  })
  if (!containerRes.ok) {
    const text = await containerRes.text()
    throw new Error(`Instagram create container failed ${containerRes.status}: ${text}`)
  }
  const { id: creationId } = await containerRes.json()

  // Step 2 — Poll container status until FINISHED (up to ~2 min for large videos)
  const pollIntervalMs = 5_000
  const maxAttempts    = 24  // 24 × 5s = 2 minutes
  let statusCode       = 'IN_PROGRESS'

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollIntervalMs))
    const statusRes = await fetchJson(
      `${base}/${creationId}?${qs({ fields: 'status_code' })}`,
      accessToken,
    )
    statusCode = statusRes?.status_code ?? statusCode
    if (statusCode === 'FINISHED') break
    if (statusCode === 'ERROR') throw new Error(`Instagram media container processing error (creation_id: ${creationId})`)
  }
  if (statusCode !== 'FINISHED') {
    throw new Error(`Instagram container did not finish within timeout (last status: ${statusCode})`)
  }

  // Step 3 — Publish the container
  const publishRes = await fetch(`${base}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ creation_id: creationId }),
  })
  if (!publishRes.ok) {
    const text = await publishRes.text()
    throw new Error(`Instagram media_publish failed ${publishRes.status}: ${text}`)
  }
  const { id: mediaId } = await publishRes.json()

  return {
    externalId: mediaId,
    url:        `https://www.instagram.com/p/${mediaId}/`,
  }
}
