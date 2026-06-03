/**
 * X (Twitter) social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'twitter',
  label:     'X (Twitter)',
  configEnv: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  scopes:    ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
}

export function isConfigured() {
  return !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('X (Twitter) not configured')
  // TODO (T4): build Twitter OAuth 2.0 PKCE authorization URL
  throw new Error('X (Twitter) adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('X (Twitter) not configured')
  // TODO (T4): exchange code via Twitter /oauth2/token; fetch user info
  throw new Error('X (Twitter) adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('X (Twitter) not configured')
  // TODO (T4): POST to Twitter /oauth2/token with grant_type=refresh_token
  throw new Error('X (Twitter) adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('X (Twitter) not configured')
  // TODO (T4): media upload (chunked) + tweet creation via Twitter API v2
  // LIVE-VERIFY: requires media.write + tweet.write scopes and elevated access
  throw new Error('X (Twitter) adapter not yet implemented')
}
