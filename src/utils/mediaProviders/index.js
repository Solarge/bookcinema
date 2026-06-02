// ── Image providers ───────────────────────────────────────────────────────
import { generateImage as falImage }       from './imageProviders/falAI'
import { generateImage as openaiImage }    from './imageProviders/openai'
import { generateImage as replicateImage } from './imageProviders/replicate'
import { generateImage as stabilityImage } from './imageProviders/stabilityAI'
import { generateImage as comfyImage }     from './imageProviders/comfyUI'
import { generateImage as a1111Image }     from './imageProviders/automatic1111'

// ── Video providers ───────────────────────────────────────────────────────
import { generateVideo as falVideo }        from './videoProviders/falAI'
import { generateVideo as runwayVideo }     from './videoProviders/runway'
import { generateVideo as replicateVideo }  from './videoProviders/replicate'
import { generateVideo as lumaVideo }       from './videoProviders/lumaAI'
import { generateVideo as minimaxVideo }    from './videoProviders/minimaxVideo'
import { generateVideo as klingDirect }     from './videoProviders/klingDirect'
import { generateVideo as localVideo }      from './videoProviders/localVideo'

// ── Voice providers ───────────────────────────────────────────────────────
import { generateVoice as elevenLabsVoice, cloneVoice as elevenLabsClone } from './voiceProviders/elevenlabs'
export { listVoices } from './voiceProviders/elevenlabs'
import { generateVoice as openaiVoice }    from './voiceProviders/openaiTTS'
import { generateVoice as googleVoice }    from './voiceProviders/googleTTS'
import { generateVoice as kokoroVoice }    from './voiceProviders/kokoro'
import { generateVoice as xttsVoice, cloneVoice as xttsClone } from './voiceProviders/xtts'

// ── Registry ──────────────────────────────────────────────────────────────
export const IMAGE_PROVIDERS = {
  'fal.ai':       { fn: falImage,       label: 'fal.ai (FLUX Pro)',       tier: 'cloud',  free: false },
  'openai':       { fn: openaiImage,    label: 'OpenAI (DALL·E 3)',       tier: 'cloud',  free: false },
  'replicate':    { fn: replicateImage, label: 'Replicate (FLUX 1.1)',    tier: 'cloud',  free: false },
  'stabilityai':  { fn: stabilityImage, label: 'Stability AI (SD3.5)',    tier: 'cloud',  free: false },
  'comfyui':      { fn: comfyImage,     label: 'ComfyUI (Local FLUX)',    tier: 'local',  free: true  },
  'a1111':        { fn: a1111Image,     label: 'Automatic1111 (Local)',   tier: 'local',  free: true  },
}

export const VIDEO_PROVIDERS = {
  'fal.ai':       { fn: falVideo,       label: 'fal.ai (Kling v2)',       tier: 'cloud',  free: false },
  'runway':       { fn: runwayVideo,    label: 'Runway ML (Gen-4)',       tier: 'cloud',  free: false },
  'replicate':    { fn: replicateVideo, label: 'Replicate (Kling)',       tier: 'cloud',  free: false },
  'lumaai':       { fn: lumaVideo,      label: 'Luma AI (Ray-2)',         tier: 'cloud',  free: false },
  'minimax':      { fn: minimaxVideo,   label: 'MiniMax (Hailuo)',        tier: 'cloud',  free: false },
  'klingdirect':  { fn: klingDirect,    label: 'Kling AI Direct',         tier: 'cloud',  free: false },
  'localvideo':   { fn: localVideo,     label: 'Local (CogVideoX/Wan)',   tier: 'local',  free: true  },
}

export const VOICE_PROVIDERS = {
  'elevenlabs':   { fn: elevenLabsVoice, label: 'ElevenLabs',            tier: 'cloud',  free: false },
  'openaitts':    { fn: openaiVoice,     label: 'OpenAI TTS',            tier: 'cloud',  free: false },
  'googletts':    { fn: googleVoice,     label: 'Google Cloud TTS',      tier: 'cloud',  free: false },
  'kokoro':       { fn: kokoroVoice,     label: 'Kokoro TTS (Local)',     tier: 'local',  free: true  },
  'xtts':         { fn: xttsVoice,       label: 'XTTS-v2 (Local)',       tier: 'local',  free: true  },
}

// ── Unified getters ───────────────────────────────────────────────────────
export function getImageProvider(name) {
  const p = IMAGE_PROVIDERS[name]
  if (!p) throw new Error(`Unknown image provider: ${name}`)
  return p.fn
}

export function getVideoProvider(name) {
  const p = VIDEO_PROVIDERS[name]
  if (!p) throw new Error(`Unknown video provider: ${name}`)
  return p.fn
}

export function getVoiceProvider(name) {
  const p = VOICE_PROVIDERS[name]
  if (!p) throw new Error(`Unknown voice provider: ${name}`)
  return p.fn
}

// Route cloneVoice to correct provider
export const cloneVoice = (opts) =>
  opts.provider === 'xtts' ? xttsClone(opts) : elevenLabsClone(opts)

// Label helpers for UI
export const IMAGE_PROVIDER_LABELS  = Object.fromEntries(Object.entries(IMAGE_PROVIDERS).map(([k, v]) => [k, v.label]))
export const VIDEO_PROVIDER_LABELS  = Object.fromEntries(Object.entries(VIDEO_PROVIDERS).map(([k, v]) => [k, v.label]))
export const VOICE_PROVIDER_LABELS  = Object.fromEntries(Object.entries(VOICE_PROVIDERS).map(([k, v]) => [k, v.label]))
