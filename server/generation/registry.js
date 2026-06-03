import * as groqText from './providers/groqText.js'
import * as anthropicText from './providers/anthropicText.js'

// Cost-first curated tiers. Image/voice tiers are added in the 1B-media slice.
export const MANAGED_PROVIDERS = {
  text: {
    standard: { provider: 'groq',      adapter: groqText,      model: groqText.DEFAULT_MODEL,      estCostUsd: 0 },
    premium:  { provider: 'anthropic', adapter: anthropicText, model: anthropicText.DEFAULT_MODEL, estCostUsd: 0.03 },
  },
}
