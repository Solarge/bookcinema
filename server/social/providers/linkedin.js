/**
 * LinkedIn social provider stub.
 * Real OAuth + publish wiring is implemented in Task 4.
 *
 * isConfigured() reads process.env directly at call time so tests can
 * set/unset env vars and see immediate effect without re-importing config.
 */

export const meta = {
  key:       'linkedin',
  label:     'LinkedIn',
  configEnv: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  scopes:    ['openid', 'profile', 'w_member_social', 'r_basicprofile'],
}

export function isConfigured() {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

export function getAuthUrl({ redirectUri, state }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')
  // TODO (T4): build LinkedIn OAuth 2.0 authorization URL
  throw new Error('LinkedIn adapter not yet implemented')
}

export async function exchangeCode({ code, redirectUri }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')
  // TODO (T4): exchange code via LinkedIn /oauth/v2/accessToken; fetch profile
  throw new Error('LinkedIn adapter not yet implemented')
}

export async function refresh({ refreshToken }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')
  // TODO (T4): LinkedIn refresh token exchange (if enabled for app)
  throw new Error('LinkedIn adapter not yet implemented')
}

export async function publishVideo({ tokens, videoUrl, caption, title }) {
  if (!isConfigured()) throw new Error('LinkedIn not configured')
  // TODO (T4): LinkedIn UGC posts API with video asset upload
  // LIVE-VERIFY: requires w_member_social permission + video upload approval
  throw new Error('LinkedIn adapter not yet implemented')
}
