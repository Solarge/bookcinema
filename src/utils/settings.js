const SETTINGS_KEY = 'bookfilm:settings'

export const DEFAULT_SETTINGS = {
  // ── Text / Series generation ─────────────────────────────────
  textProvider: 'anthropic',   // anthropic | groq | deepseek | gemini | ollama
  textModel:    '',            // overrides provider default model (optional)
  language:     'en',          // output language code (en | es | fr | de | zh | etc.)

  // ── Managed generation (server-side, platform keys) ──────────
  mode:        'managed',  // 'byok' (client-side, your keys) | 'managed' (server-side, platform keys)
  managedTier: 'standard', // 'standard' | 'premium'

  // ── Image generation ─────────────────────────────────────────
  imageProvider: 'fal.ai',    // fal.ai | openai | replicate | stabilityai | comfyui | a1111
  imageQuality:  'hd',        // standard | hd | ultra

  // ── Video generation ─────────────────────────────────────────
  videoProvider: 'fal.ai',    // fal.ai | runway | replicate | lumaai | minimax | klingdirect | localvideo
  videoQuality:  'hd',        // standard | hd | master
  videoDuration: '5',         // '5' | '10'

  // ── Voice generation ─────────────────────────────────────────
  voiceProvider: 'elevenlabs', // elevenlabs | openaitts | googletts | kokoro | xtts

  // ── Shared ───────────────────────────────────────────────────
  generationMode: 'on-demand', // on-demand | batch | hybrid
  aspectRatio:    '9:16',      // 9:16 | 16:9 | 1:1
  genrePreset:    'cinematic',
  variations:     1,

  // ── API keys (cloud providers) ───────────────────────────────
  apiKeys: {
    anthropic:    '',
    groq:         '',
    deepseek:     '',
    gemini:       '',
    falai:        '',
    openai:       '',
    replicate:    '',
    runway:       '',
    elevenlabs:   '',
    stabilityai:  '',
    lumaai:       '',
    minimax:      '',
    klingdirect:  '',
    googletts:    '',
  },

  // ── Local server URLs (self-hosted) ──────────────────────────
  localUrls: {
    ollama:      'http://localhost:11434',
    a1111:       'http://localhost:7860',
    comfyui:     'http://localhost:8188',
    localvideo:  'http://localhost:7861',
    kokoro:      'http://localhost:8880',
    xtts:        'http://localhost:8020',
  },

  // ── ComfyUI model name ────────────────────────────────────────
  comfyFluxModel: 'flux1-dev-fp8.safetensors',

  // ── White label ───────────────────────────────────────────────
  whiteLabel: {
    enabled:      false,
    appName:      'BookFilm Studio',
    logoUrl:      '',
    primaryColor: '#c8922a',
  },
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const saved = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      // BYO is hidden — the product is managed-only. Override any legacy persisted
      // mode:'byok' so existing users aren't stranded without a way to switch.
      mode: 'managed',
      apiKeys:    { ...DEFAULT_SETTINGS.apiKeys,    ...saved.apiKeys },
      localUrls:  { ...DEFAULT_SETTINGS.localUrls,  ...saved.localUrls },
      whiteLabel: { ...DEFAULT_SETTINGS.whiteLabel, ...saved.whiteLabel },
    }
  } catch (err) {
    console.warn('loadSettings failed, using defaults:', err)
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (err) { console.warn('saveSettings failed:', err) }
}
