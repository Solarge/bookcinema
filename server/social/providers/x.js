/**
 * X (formerly Twitter) social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 *
 * Supports both X_CLIENT_ID / X_CLIENT_SECRET and the legacy
 * TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET env names.
 */

export const meta = {
  key:       'x',
  label:     'X',
  configEnv: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  scopes:    ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
}

export function isConfigured() {
  const id     = process.env.X_CLIENT_ID     || process.env.TWITTER_CLIENT_ID
  const secret = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET
  return !!(id && secret)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('X not configured')
  // TODO (T4): build X OAuth 2.0 PKCE authorization URL
  throw new Error('X adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('X not configured')
  // TODO (T4): exchange code via X /oauth2/token; fetch user info
  throw new Error('X adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('X not configured')
  // TODO (T4): POST to X /oauth2/token with grant_type=refresh_token
  throw new Error('X adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('X not configured')
  // TODO (T4): media upload (chunked) + tweet creation via X API v2
  // LIVE-VERIFY: requires media.write + tweet.write scopes and elevated access
  throw new Error('X adapter not yet implemented')
}
