// Per-unit costs in USD — $0 for local/self-hosted providers
export const PROVIDER_COSTS = {
  text: {
    anthropic:   { per1kTokens: 0.003  },
    groq:        { per1kTokens: 0      }, // free tier
    deepseek:    { per1kTokens: 0.0001 },
    gemini:      { per1kTokens: 0      }, // free tier
    ollama:      { per1kTokens: 0      }, // local
  },
  image: {
    'fal.ai':     { standard: 0.003, hd: 0.005, ultra: 0.008 },
    'openai':     { standard: 0.02,  hd: 0.04,  ultra: 0.04  },
    'replicate':  { standard: 0.003, hd: 0.005, ultra: 0.009 },
    'stabilityai':{ standard: 0.035, hd: 0.065, ultra: 0.04  },
    'comfyui':    { standard: 0,     hd: 0,     ultra: 0      }, // local
    'a1111':      { standard: 0,     hd: 0,     ultra: 0      }, // local
  },
  video: {
    'fal.ai':      { standard: 0.14, hd: 0.28, master: 0.35 },
    'runway':      { standard: 0.35, hd: 0.5,  master: 0.5  },
    'replicate':   { standard: 0.2,  hd: 0.28, master: 0.28 },
    'lumaai':      { standard: 0.14, hd: 0.35, master: 0.35 },
    'minimax':     { standard: 0.14, hd: 0.28, master: 0.28 },
    'klingdirect': { standard: 0.14, hd: 0.28, master: 0.35 },
    'localvideo':  { standard: 0,    hd: 0,    master: 0     }, // local
  },
  voice: {
    elevenlabs:  0.0003,   // per character
    openaitts:   0.000015, // per character (~$0.015/1K)
    googletts:   0.000004, // per character (~$4/1M)
    kokoro:      0,        // local
    xtts:        0,        // local
  },
}

const SESSION_KEY = 'bookfilm:session-cost'

export function getCost(type, provider, quality = 'hd') {
  const tier = PROVIDER_COSTS[type]?.[provider]
  if (!tier) return 0
  if (typeof tier === 'number') return tier
  return tier[quality] ?? tier.hd ?? 0
}

export function getVoiceCost(text, provider = 'elevenlabs') {
  const rate = PROVIDER_COSTS.voice[provider] ?? 0
  return rate * text.length
}

export function loadSessionCost() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) ?? { images: 0, videos: 0, voice: 0 }
  } catch (err) {
    console.warn('loadSessionCost failed:', err)
    return { images: 0, videos: 0, voice: 0 }
  }
}

export function saveSessionCost(cost) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(cost)) } catch (err) { console.warn('saveSessionCost failed:', err) }
}

export function resetSessionCost() {
  try { localStorage.removeItem(SESSION_KEY) } catch (err) { console.warn('resetSessionCost failed:', err) }
  return { images: 0, videos: 0, voice: 0 }
}

export function totalCost(cost) {
  return ((cost.images ?? 0) + (cost.videos ?? 0) + (cost.voice ?? 0)).toFixed(4)
}

export function estimateBatchCost(series, settings) {
  const chars    = series.characters?.length ?? 0
  const scenes   = series.episodes?.reduce((a, ep) => a + (ep.scenes?.length ?? 0), 0) ?? 0
  const dlgChars = series.episodes?.reduce((a, ep) =>
    a + ep.scenes?.reduce((b, s) =>
      b + s.dialogue?.reduce((c, l) => c + (l.line?.length ?? 0), 0), 0), 0) ?? 0

  const imgCost = chars  * getCost('image', settings.imageProvider, settings.imageQuality) * settings.variations
  const vidCost = scenes * getCost('video', settings.videoProvider, settings.videoQuality)  * settings.variations
  const vcCost  = getVoiceCost('x'.repeat(dlgChars), settings.voiceProvider)

  return { images: imgCost, videos: vidCost, voice: vcCost, total: imgCost + vidCost + vcCost, counts: { chars, scenes, dlgChars } }
}

// True if provider is free/local (useful for UI badges)
export function isFree(type, provider) {
  const costs = PROVIDER_COSTS[type]?.[provider]
  if (!costs) return false
  if (typeof costs === 'number') return costs === 0
  return Object.values(costs).every(v => v === 0)
}
