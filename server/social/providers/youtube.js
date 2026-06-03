/**
 * YouTube social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'youtube',
  label:     'YouTube',
  configEnv: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  scopes:    ['https://www.googleapis.com/auth/youtube.upload'],
}

export function isConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('YouTube not configured')
  // TODO (T4): build real Google OAuth2 authorization URL
  throw new Error('YouTube adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('YouTube not configured')
  // TODO (T4): exchange code via Google token endpoint; fetch channel info
  throw new Error('YouTube adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('YouTube not configured')
  // TODO (T4): POST to Google token endpoint with grant_type=refresh_token
  throw new Error('YouTube adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('YouTube not configured')
  // TODO (T4): resumable upload via YouTube Data API v3
  // LIVE-VERIFY: requires a valid OAuth token with youtube.upload scope
  throw new Error('YouTube adapter not yet implemented')
}
