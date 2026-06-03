/**
 * TikTok social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'tiktok',
  label:     'TikTok',
  configEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  scopes:    ['video.upload', 'video.publish'],
}

export function isConfigured() {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('TikTok not configured')
  // TODO (T4): build TikTok OAuth2 authorization URL
  throw new Error('TikTok adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('TikTok not configured')
  // TODO (T4): exchange code via TikTok token endpoint; fetch creator info
  throw new Error('TikTok adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('TikTok not configured')
  // TODO (T4): POST to TikTok token endpoint with refresh_token
  throw new Error('TikTok adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('TikTok not configured')
  // TODO (T4): TikTok Content Posting API — pull_from_url or direct post
  // LIVE-VERIFY: requires a valid OAuth token with video.upload scope
  throw new Error('TikTok adapter not yet implemented')
}
