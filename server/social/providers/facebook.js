/**
 * Facebook social provider stub.
 * Uses Meta app credentials (META_APP_ID / META_APP_SECRET).
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'facebook',
  label:     'Facebook',
  configEnv: ['META_APP_ID', 'META_APP_SECRET'],
  scopes:    ['pages_manage_posts', 'pages_read_engagement'],
}

export function isConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('Facebook not configured')
  // TODO (T4): build Facebook OAuth dialog URL
  throw new Error('Facebook adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('Facebook not configured')
  // TODO (T4): exchange code via Meta Graph /oauth/access_token; fetch Page list
  throw new Error('Facebook adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('Facebook not configured')
  // TODO (T4): long-lived token refresh via Meta Graph API
  throw new Error('Facebook adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('Facebook not configured')
  // TODO (T4): Meta Graph Page video publish
  // LIVE-VERIFY: requires pages_manage_posts permission + approved app
  throw new Error('Facebook adapter not yet implemented')
}
