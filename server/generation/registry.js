import * as groqText from './providers/groqText.js'
import * as anthropicText from './providers/anthropicText.js'
import * as geminiText from './providers/geminiText.js'
import * as openaiTTSVoice from './providers/openaiTTSVoice.js'
import * as elevenlabsVoice from './providers/elevenlabsVoice.js'
import * as replicateImage from './providers/replicateImage.js'
import * as falaiImage from './providers/falaiImage.js'
import * as replicateVideo from './providers/replicateVideo.js'
import * as falaiVideo from './providers/falaiVideo.js'

// Free-first provider fallback chains.
// Each tier has an ordered `providers` list; the worker tries them in order,
// skipping providers whose isConfigured() returns false, and failing over on error.
// Credits charged = the tier's nominal credits regardless of which provider serves.
export const MANAGED_PROVIDERS = {
  text: {
    standard: {
      credits: 1, estCostUsd: 0,
      providers: [
        { provider: 'groq',   adapter: groqText,   model: groqText.DEFAULT_MODEL },
        { provider: 'gemini', adapter: geminiText, model: geminiText.DEFAULT_MODEL },
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
        { provider: 'replicate', adapter: replicateImage, model: replicateImage.DEFAULT_MODEL },
        { provider: 'falai',     adapter: falaiImage,     model: falaiImage.DEFAULT_MODEL },
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
    // openai first (cheapest) but out-of-quota here → fails over to elevenlabs automatically
    standard: {
      credits: 1, estCostUsd: 0.0005,
      providers: [
        { provider: 'openai',     adapter: openaiTTSVoice, model: openaiTTSVoice.DEFAULT_MODEL },
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
  // Video is expensive: standard ~$0.20/clip (minimax via Replicate), premium ~$0.40/clip (kling via fal.ai)
  // Credits: standard=20, premium=40 — ~5× image-premium, proportional to actual cost ratio.
  video: {
    standard: {
      credits: 20, estCostUsd: 0.20,
      providers: [
        { provider: 'replicate', adapter: replicateVideo, model: replicateVideo.DEFAULT_MODEL },
        { provider: 'falai',     adapter: falaiVideo,     model: falaiVideo.DEFAULT_MODEL },
      ],
    },
    premium: {
      credits: 40, estCostUsd: 0.40,
      providers: [
        { provider: 'falai',     adapter: falaiVideo,     model: falaiVideo.DEFAULT_MODEL },
        { provider: 'replicate', adapter: replicateVideo, model: replicateVideo.DEFAULT_MODEL },
      ],
    },
  },
}
