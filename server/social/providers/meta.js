/**
 * Meta (Instagram/Facebook) social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'meta',
  label:     'Meta (Instagram/Facebook)',
  configEnv: ['META_APP_ID', 'META_APP_SECRET'],
  scopes:    ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
}

export function isConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('Meta (Instagram/Facebook) not configured')
  // TODO (T4): build Facebook OAuth dialog URL
  throw new Error('Meta (Instagram/Facebook) adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('Meta (Instagram/Facebook) not configured')
  // TODO (T4): exchange code via Meta Graph /oauth/access_token; fetch IG accounts
  throw new Error('Meta (Instagram/Facebook) adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('Meta (Instagram/Facebook) not configured')
  // TODO (T4): long-lived token refresh via Meta Graph API
  throw new Error('Meta (Instagram/Facebook) adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('Meta (Instagram/Facebook) not configured')
  // TODO (T4): Meta Graph video/Reels publish (two-step: container + publish)
  // LIVE-VERIFY: requires instagram_content_publish permission + approved app
  throw new Error('Meta (Instagram/Facebook) adapter not yet implemented')
}
