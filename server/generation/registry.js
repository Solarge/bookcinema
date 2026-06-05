import * as groqText from './providers/groqText.js'
import * as anthropicText from './providers/anthropicText.js'
import * as geminiText from './providers/geminiText.js'
import * as deepseekText from './providers/deepseekText.js'
import * as openaiTTSVoice from './providers/openaiTTSVoice.js'
import * as googleTTSVoice from './providers/googleTTSVoice.js'
import * as elevenlabsVoice from './providers/elevenlabsVoice.js'
import * as replicateImage from './providers/replicateImage.js'
import * as stabilityImage from './providers/stabilityImage.js'
import * as falaiImage from './providers/falaiImage.js'
import * as replicateVideo from './providers/replicateVideo.js'
import * as runwayVideo from './providers/runwayVideo.js'
import * as lumaVideo from './providers/lumaVideo.js'
import * as falaiVideo from './providers/falaiVideo.js'
import * as replicateMusic from './providers/replicateMusic.js'

// Fixed estimated cost for job types that don't go through the provider registry
// (e.g. compile = server-side ffmpeg; small fixed cost for CPU/egress).
// These are ESTIMATES — real provider billing APIs are not polled.
export const FLAT_EST_COSTS = {
  compile: 0.02,
}

// Free-first provider fallback chains.
// Each tier has an ordered `providers` list; the worker tries them in order,
// skipping providers whose isConfigured() returns false, and failing over on error.
// Credits charged = the tier's nominal credits regardless of which provider serves.
//
// freeOnly: true — optional flag on a provider entry.
// When set, the worker will SKIP this provider for paid-plan (pro/studio) workspaces.
// Purpose: free-tier API accounts (Groq free, Gemini free, etc.) prohibit commercial use.
// Paid customers must not inadvertently run on these keys.
// Usage: once the operator confirms a provider key is a free-tier account, add
//   freeOnly: true to its entry. Example:
//     { provider: 'groq', adapter: groqText, model: groqText.DEFAULT_MODEL, freeOnly: true },
// Default is no entries flagged → no behavior change until the operator explicitly marks them.
export const MANAGED_PROVIDERS = {
  text: {
    standard: {
      credits: 1, estCostUsd: 0,
      providers: [
        { provider: 'groq',     adapter: groqText,     model: groqText.DEFAULT_MODEL },
        { provider: 'gemini',   adapter: geminiText,   model: geminiText.DEFAULT_MODEL },
        { provider: 'deepseek', adapter: deepseekText, model: deepseekText.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 3, estCostUsd: 0.03,
      providers: [
        { provider: 'anthropic', adapter: anthropicText, model: anthropicText.DEFAULT_MODEL },
        { provider: 'groq',      adapter: groqText,      model: groqText.DEFAULT_MODEL },
      ],
    },
  },
  image: {
    standard: {
      credits: 4, estCostUsd: 0.003,
      providers: [
        { provider: 'replicate',  adapter: replicateImage,  model: replicateImage.DEFAULT_MODEL },
        { provider: 'stability',  adapter: stabilityImage,  model: stabilityImage.DEFAULT_MODEL },
        { provider: 'falai',      adapter: falaiImage,      model: falaiImage.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 10, estCostUsd: 0.05,
      providers: [
        { provider: 'falai',     adapter: falaiImage,     model: falaiImage.DEFAULT_MODEL },
        { provider: 'replicate', adapter: replicateImage, model: replicateImage.DEFAULT_MODEL },
      ],
    },
  },
  voice: {
    // openai first (cheapest) but out-of-quota here → fails over to googletts then elevenlabs automatically
    standard: {
      credits: 1, estCostUsd: 0.0005,
      providers: [
        { provider: 'openai',     adapter: openaiTTSVoice, model: openaiTTSVoice.DEFAULT_MODEL },
        { provider: 'googletts',  adapter: googleTTSVoice, model: googleTTSVoice.DEFAULT_MODEL },
        { provider: 'elevenlabs', adapter: elevenlabsVoice, model: elevenlabsVoice.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 5, estCostUsd: 0.01,
      providers: [
        { provider: 'elevenlabs', adapter: elevenlabsVoice, model: elevenlabsVoice.DEFAULT_MODEL },
        { provider: 'openai',     adapter: openaiTTSVoice,  model: openaiTTSVoice.DEFAULT_MODEL },
      ],
    },
  },
  // Video is expensive. Real provider cost per ~5 s clip is $0.50–$2.00 (Replicate minimax / fal kling /
  // Runway / Luma). estCostUsd is an ESTIMATE based on observed rates — not an exact per-call figure
  // (provider billing APIs are not polled; use Job.costUsd aggregates for spend visibility).
  // Re-priced 2025: standard 40 cr ($1.60 rev @ $0.04/cr) vs ~$0.60 est cost → positive margin.
  // premium 80 cr ($3.20 rev) vs ~$1.20 est cost → positive margin.
  video: {
    standard: {
      credits: 40, estCostUsd: 0.6,
      providers: [
        { provider: 'replicate', adapter: replicateVideo, model: replicateVideo.DEFAULT_MODEL },
        { provider: 'runway',    adapter: runwayVideo,    model: runwayVideo.DEFAULT_MODEL },
        { provider: 'luma',      adapter: lumaVideo,      model: lumaVideo.DEFAULT_MODEL },
        { provider: 'falai',     adapter: falaiVideo,     model: falaiVideo.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 80, estCostUsd: 1.2,
      providers: [
        { provider: 'falai',     adapter: falaiVideo,     model: falaiVideo.PRO_MODEL },
        { provider: 'runway',    adapter: runwayVideo,    model: runwayVideo.DEFAULT_MODEL },
        { provider: 'luma',      adapter: lumaVideo,      model: lumaVideo.DEFAULT_MODEL },
        { provider: 'replicate', adapter: replicateVideo, model: replicateVideo.DEFAULT_MODEL },
        { provider: 'falai',     adapter: falaiVideo,     model: falaiVideo.DEFAULT_MODEL },   // standard fallback
      ],
    },
  },
  // Music / soundtrack — generated scores (per-scene beds + per-episode score).
  // Served by Replicate MusicGen; both tiers use the same model today (the premium
  // tier exists for cohesive longer episode scores and is priced higher accordingly).
  music: {
    standard: {
      credits: 10, estCostUsd: 0.1,
      providers: [
        { provider: 'replicate', adapter: replicateMusic, model: replicateMusic.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 15, estCostUsd: 0.15,
      providers: [
        { provider: 'replicate', adapter: replicateMusic, model: replicateMusic.DEFAULT_MODEL },
      ],
    },
  },
}

/**
 * Return the estimated provider cost (USD) for a given type+tier.
 * For flat/compile types, returns FLAT_EST_COSTS[type].
 * NOTE: These are ESTIMATES — real per-call costs from providers are not
 * fetched via billing APIs. Use aggregated Job.costUsd for spend visibility.
 */
export function estCostFor(type, tier) {
  if (type in FLAT_EST_COSTS) return FLAT_EST_COSTS[type]
  const tiers = MANAGED_PROVIDERS[type]
  if (!tiers) return 0
  const entry = tiers[tier]
  if (!entry) return 0
  return entry.estCostUsd ?? 0
}
