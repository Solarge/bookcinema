/**
 * LinkedIn social provider — LinkedIn OAuth 2.0 + LinkedIn APIs (video + UGC posts).
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID     — LinkedIn app client ID
 *   LINKEDIN_CLIENT_SECRET — LinkedIn app client secret
 *
 * Scopes requested:
 *   openid          — OIDC identity
 *   profile         — basic profile (name)
 *   w_member_social — create posts with video on behalf of the member
 *   r_basicprofile  — read profile info (legacy; redundant with profile but safe to include)
 *
 * Publish flow (video post):
 *   1. POST /rest/videos?action=initializeUpload
 *      → returns uploadInstructions[0].uploadUrl + video URN
 *   2. PUT the video bytes to the returned upload URL (single-part for files < ~200 MB;
 *      multi-part for larger files — this adapter uses single-part for simplicity).
 *   3. POST /rest/videos?action=finalizeUpload with the video URN.
 *   4. POST /rest/posts with content.media.id = video URN + commentary = caption.
 *
 * LinkedIn API references:
 *   OAuth 2.0:     https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 *   Video upload:  https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/video-api
 *   UGC Posts:     https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 *
 * Notes:
 *   - Refresh tokens are only available if the LinkedIn app has the Refresh Token grant enabled
 *     in the App settings. If not enabled, refresh() will fail gracefully.
 *   - Video upload requires the app to have "Video APIs" product enabled.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

import { postForm, fetchJson, downloadBytes, qs, expiresAt } from './_util.js'

const LI_AUTH_URL       = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN_URL      = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_API_BASE       = 'https://api.linkedin.com'
const LI_USERINFO_URL   = `${LI_API_BASE}/v2/userinfo`

export const meta = {
  key:       'linkedin',
  label:     'LinkedIn',
  configEnv: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  scopes:    ['openid', 'profile', 'w_member_social', 'r_basicprofile'],
}

export function isConfigured() {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

/**
 * Build the LinkedIn OAuth 2.0 authorization URL.
 *
 * @param {{ redirectUri: string, state: string }} opts
 * @returns {string}
 */
export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')
  const params = qs({
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         meta.scopes.join(' '),
    state,
  })
  return `${LI_AUTH_URL}?${params}`
}

/**
 * Exchange an authorization code for tokens and fetch the member's profile.
 *
 * @param {{ code: string, redirectUri: string }} opts
 * @returns {Promise<{
 *   account: { externalId: string, displayName: string, scopes: string[] },
 *   tokens:  { accessToken: string, refreshToken: string|null, expiresAt: Date }
 * }>}
 */
export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')

  const tokenData = await postForm(LI_TOKEN_URL, {
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  })

  const { access_token, refresh_token, expires_in } = tokenData

  // Fetch member profile via OpenID Connect userinfo endpoint
  const userInfo    = await fetchJson(LI_USERINFO_URL, access_token)
  const externalId  = userInfo.sub  ?? ''
  const displayName = userInfo.name ?? ''

  return {
    account: { externalId, displayName, scopes: meta.scopes },
    tokens: {
      accessToken:  access_token,
      refreshToken: refresh_token ?? null,
      expiresAt:    expiresAt(expires_in ?? 5183944),
    },
  }
}

/**
 * Refresh a LinkedIn access token.
 * Only works if the LinkedIn app has Refresh Token support enabled.
 *
 * @param {{ refreshToken: string }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')

  const tokenData = await postForm(LI_TOKEN_URL, {
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  })

  return {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? refreshToken,
    expiresAt:    expiresAt(tokenData.expires_in ?? 5183944),
  }
}

/**
 * Publish a video post on LinkedIn.
 *
 * Steps:
 *   1. initializeUpload  — get an upload URL + video URN from /rest/videos?action=initializeUpload
 *   2. PUT bytes         — upload the video bytes to the returned uploadUrl
 *   3. finalizeUpload    — confirm the upload is complete
 *   4. Create post       — POST /rest/posts with the video URN + caption
 *
 * LIVE-VERIFY: requires a valid access_token with w_member_social scope,
 * and the LinkedIn app must have the "Video APIs" product enabled.
 *
 * @param {{
 *   tokens:   { accessToken: string },
 *   videoUrl: string,
 *   caption:  string
 * }} opts
 * @returns {Promise<{ externalId: string, url: string }>}
 */
export async function publishVideo({ tokens, videoUrl, caption }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')

  const { accessToken } = tokens

  // Step 0 — get the member's LinkedIn URN (sub) for the owner field
  const userInfo    = await fetchJson(LI_USERINFO_URL, accessToken)
  const sub         = typeof userInfo.sub === 'string' ? userInfo.sub : ''
  const memberUrn   = `urn:li:person:${sub}`

  // Step 1 — initialize upload, get uploadUrl + video URN
  const { buffer, contentType, contentLength } = await downloadBytes(videoUrl)

  const initRes = await fetch(`${LI_API_BASE}/rest/videos?action=initializeUpload`, {
    method: 'POST',
    headers: {
      Authorization:          `Bearer ${accessToken}`,
      'Content-Type':         'application/json',
      'LinkedIn-Version':     '202411',   // use a recent stable monthly version
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner:            memberUrn,
        fileSizeBytes:    contentLength,
        uploadCaptions:   false,
        uploadThumbnail:  false,
      },
    }),
  })

  if (!initRes.ok) {
    const text = await initRes.text()
    throw new Error(`LinkedIn initializeUpload failed ${initRes.status}: ${text}`)
  }

  const initData  = await initRes.json()
  const videoUrn  = initData?.value?.video               // e.g. "urn:li:video:C5600..."
  const uploadUrl = initData?.value?.uploadInstructions?.[0]?.uploadUrl

  if (!videoUrn || !uploadUrl) {
    throw new Error('LinkedIn initializeUpload: missing video URN or uploadUrl in response')
  }

  // Step 2 — PUT the video bytes
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type':   contentType,
      'Content-Length': String(contentLength),
    },
    body: buffer,
  })
  if (!putRes.ok) {
    const text = await putRes.text()
    throw new Error(`LinkedIn video PUT failed ${putRes.status}: ${text}`)
  }

  // Capture the ETag for the finalizeUpload request
  const etag = putRes.headers.get('ETag') ?? ''

  // Step 3 — finalizeUpload
  const finalRes = await fetch(`${LI_API_BASE}/rest/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: {
      Authorization:               `Bearer ${accessToken}`,
      'Content-Type':              'application/json',
      'LinkedIn-Version':          '202411',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      finalizeUploadRequest: {
        video:            videoUrn,
        uploadToken:      '',          // optional; leave empty if not provided by init
        uploadedPartIds:  [etag],
      },
    }),
  })
  if (!finalRes.ok) {
    const text = await finalRes.text()
    throw new Error(`LinkedIn finalizeUpload failed ${finalRes.status}: ${text}`)
  }

  // Step 4 — Create the post
  const postRes = await fetch(`${LI_API_BASE}/rest/posts`, {
    method: 'POST',
    headers: {
      Authorization:               `Bearer ${accessToken}`,
      'Content-Type':              'application/json',
      'LinkedIn-Version':          '202411',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author:       memberUrn,
      commentary:   caption ?? '',
      visibility:   'PUBLIC',
      distribution: {
        feedDistribution:             'MAIN_FEED',
        targetEntities:               [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id:    videoUrn,
          title: '',
        },
      },
      lifecycleState:       'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!postRes.ok) {
    const text = await postRes.text()
    throw new Error(`LinkedIn create post failed ${postRes.status}: ${text}`)
  }

  // LinkedIn returns the post URN in the X-RestLi-Id header or the body
  const postId = postRes.headers.get('X-RestLi-Id') ?? postRes.headers.get('x-restli-id') ?? videoUrn

  return {
    externalId: postId,
    url:        `https://www.linkedin.com/feed/update/${postId}/`,
  }
}
