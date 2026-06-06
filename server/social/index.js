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
 * Returns an array of EVERY supported platform with its configured state, as
 * { key, label, configured }. Unlike a "configured-only" filter, this always
 * lists all platforms so the UI can render unconfigured ones (greyed out with
 * a "needs admin setup" affordance) instead of silently hiding them.
 *
 * Used by GET /api/social/providers.
 */
export function listAll() {
  return Array.from(SOCIAL_PROVIDERS.entries()).map(([key, provider]) => ({
    key,
    label:      provider.meta.label,
    configured: provider.isConfigured(),
  }))
}

/**
 * Backward-compatible alias of listAll(). Historically this returned every
 * platform with a `configured` flag (NOT a filtered list), so the shape is
 * identical — kept so existing callers/tests keep working.
 */
export function listConfigured() {
  return listAll()
}
