import { resolve } from './resolve.js'

// Flat costs for special job types that don't go through the provider registry.
const FLAT_COSTS = {
  compile: 5, // 5 credits flat — scene clips were already paid for; covers ffmpeg processing
  mux: 5, // 5 credits flat — same ffmpeg post-process treatment as compile (audio mux onto a clip)
}

export function creditCost(type, tier) {
  if (type in FLAT_COSTS) return FLAT_COSTS[type]
  const entry = resolve(type, tier) // throws on unknown type/tier
  return entry.credits ?? 1
}
