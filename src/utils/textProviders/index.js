import { generateSeries as anthropicGenerate } from './anthropic'
import { generateSeries as groqGenerate }      from './groq'
import { generateSeries as deepseekGenerate }  from './deepseek'
import { generateSeries as geminiGenerate }    from './gemini'
import { generateSeries as ollamaGenerate }    from './ollama'

export const TEXT_PROVIDERS = {
  // ── Cloud (paid / free-tier) ─────────────────────────────────────
  anthropic: { fn: anthropicGenerate, label: 'Claude (Anthropic)',     tier: 'cloud',  free: false, badge: 'Best quality'   },
  groq:      { fn: groqGenerate,      label: 'Groq (Llama 3.3 70B)',   tier: 'cloud',  free: true,  badge: 'Free tier ⚡'   },
  deepseek:  { fn: deepseekGenerate,  label: 'DeepSeek V3',            tier: 'cloud',  free: false, badge: 'Ultra-cheap'   },
  gemini:    { fn: geminiGenerate,    label: 'Gemini 2.0 Flash',       tier: 'cloud',  free: true,  badge: 'Free tier'     },
  // ── Self-hosted (zero cost) ───────────────────────────────────────
  ollama:    { fn: ollamaGenerate,    label: 'Ollama (Local LLM)',      tier: 'local',  free: true,  badge: 'Self-hosted 🖥' },
}

export async function generateSeries(bookText, genrePresetKey, settings) {
  const provider = TEXT_PROVIDERS[settings.textProvider]
  if (!provider) throw new Error(`Unknown text provider: ${settings.textProvider}`)

  const providerSettings = {
    apiKey:  settings.apiKeys[settings.textProvider] || settings.apiKeys.anthropic,
    model:   settings.textModel,
    baseUrl: settings.localUrls?.ollama || 'http://localhost:11434',
  }

  return provider.fn(bookText, genrePresetKey, providerSettings, settings.language ?? 'en')
}
