import { MANAGED_PROVIDERS } from './registry.js'

export function resolve(type, tier) {
  const tiers = MANAGED_PROVIDERS[type]
  if (!tiers) throw new Error(`Unknown generation type: ${type}`)
  const entry = tiers[tier]
  if (!entry) throw new Error(`Unknown tier '${tier}' for type '${type}'`)
  return entry
}

// Returns the ordered providers array for a given type/tier.
// Callers iterate this list to implement free-first failover.
export function resolveProviders(type, tier) {
  return resolve(type, tier).providers
}
