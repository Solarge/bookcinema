import * as youtube   from './providers/youtube.js'
import * as tiktok    from './providers/tiktok.js'
import * as instagram from './providers/instagram.js'
import * as facebook  from './providers/facebook.js'
import * as x        from './providers/x.js'
import * as linkedin  from './providers/linkedin.js'

/**
 * Registry of all social platform providers.
 * Key matches platform enum used in SocialAccount + ScheduledPost models.
 */
export const SOCIAL_PROVIDERS = new Map([
  ['youtube',   youtube],
  ['tiktok',    tiktok],
  ['instagram', instagram],
  ['facebook',  facebook],
  ['x',         x],
  ['linkedin',  linkedin],
])

/**
 * Get a provider module by platform key.
 * Throws on unknown keys so callers never silently get undefined.
 */
export function getProvider(key) {
  const provider = SOCIAL_PROVIDERS.get(key)
  if (!provider) throw new Error(`Unknown social platform: ${key}`)
  return provider
}

/**
 * Returns an array of all platforms with their configured state.
 * Used by GET /api/social/providers to show UI what's available.
 */
export function listConfigured() {
  return Array.from(SOCIAL_PROVIDERS.entries()).map(([key, provider]) => ({
    key,
    label:      provider.meta.label,
    configured: provider.isConfigured(),
  }))
}
