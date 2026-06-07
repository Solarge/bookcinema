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

/** Ordered list of every supported platform key. */
export const PLATFORM_KEYS = Array.from(SOCIAL_PROVIDERS.keys())

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
 * The credential-field descriptors a tenant must supply for a platform —
 * an array of { key, label, secret? }. Pure (no env / no DB); the route layer
 * decides "configured" per-workspace by checking stored SocialAppCredentials.
 */
export function credentialFields(platform) {
  return getProvider(platform).meta.credentialFields || []
}

/**
 * The credential keys a tenant must supply for a platform (e.g. ['client_id',
 * 'client_secret']). Prefers the provider's requiredKeys() export; falls back
 * to deriving from credentialFields.
 */
export function requiredKeys(platform) {
  const provider = getProvider(platform)
  if (typeof provider.requiredKeys === 'function') return provider.requiredKeys()
  return credentialFields(platform).map(f => f.key)
}

/**
 * Returns metadata for EVERY supported platform as { key, label, credentialFields }.
 * "configured" is NOT included here because it is per-workspace — the route
 * computes it from stored SocialAppCredentials. Used by GET /api/social/providers.
 */
export function listAll() {
  return PLATFORM_KEYS.map((key) => {
    const provider = SOCIAL_PROVIDERS.get(key)
    return {
      key,
      label:            provider.meta.label,
      credentialFields: provider.meta.credentialFields || [],
    }
  })
}
