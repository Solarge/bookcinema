import * as groqText from './providers/groqText.js'
import * as anthropicText from './providers/anthropicText.js'
import * as openaiTTSVoice from './providers/openaiTTSVoice.js'
import * as elevenlabsVoice from './providers/elevenlabsVoice.js'
import * as replicateImage from './providers/replicateImage.js'
import * as falaiImage from './providers/falaiImage.js'

// Cost-first curated tiers. Image/voice tiers are added in the 1B-media slice.
export const MANAGED_PROVIDERS = {
  text: {
    standard: { provider: 'groq',      adapter: groqText,      model: groqText.DEFAULT_MODEL,      estCostUsd: 0,      credits: 1 },
    premium:  { provider: 'anthropic', adapter: anthropicText, model: anthropicText.DEFAULT_MODEL, estCostUsd: 0.03,   credits: 3 },
  },
  image: {
    standard: { provider: 'replicate', adapter: replicateImage, model: replicateImage.DEFAULT_MODEL, estCostUsd: 0.003, credits: 4 },
    premium:  { provider: 'falai',     adapter: falaiImage,     model: falaiImage.DEFAULT_MODEL,     estCostUsd: 0.05,  credits: 10 },
  },
  voice: {
    standard: { provider: 'openai',     adapter: openaiTTSVoice, model: openaiTTSVoice.DEFAULT_MODEL, estCostUsd: 0.0005, credits: 1 },
    premium:  { provider: 'elevenlabs', adapter: elevenlabsVoice, model: elevenlabsVoice.DEFAULT_MODEL, estCostUsd: 0.01,  credits: 5 },
  },
}
