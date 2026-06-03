import { resolve } from './resolve.js'
export function creditCost(type, tier) {
  const entry = resolve(type, tier) // throws on unknown type/tier
  return entry.credits ?? 1
}
