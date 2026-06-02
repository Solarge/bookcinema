import { createContext, useContext, useState, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from './SettingsContext'
import { getImageProvider, getVideoProvider, getVoiceProvider } from '../utils/mediaProviders/index'
import { fetchAndStore } from '../utils/assetStore'
import { getCost, getVoiceCost, loadSessionCost, saveSessionCost } from '../utils/costTracker'
import { getPreset } from '../utils/genrePresets'

const MediaContext = createContext(null)

const IDLE = { status: 'idle', localUrl: null, remoteUrl: null, error: null, approvalStatus: 'pending', variations: [] }

function mediaKey(type, seriesSlug, ...parts) {
  return `${type}:${seriesSlug}:${parts.join(':')}`
}

// Build provider-specific extra args (local URLs, model names, etc.)
function localArgs(settings, providerKey) {
  const urls = settings.localUrls ?? {}
  const map = {
    comfyui:    { baseUrl: urls.comfyui,    fluxModel: settings.comfyFluxModel },
    a1111:      { baseUrl: urls.a1111 },
    localvideo: { baseUrl: urls.localvideo, localVideoMode: settings.localVideoMode ?? 'openai' },
    kokoro:     { baseUrl: urls.kokoro },
    xtts:       { baseUrl: urls.xtts },
    ollama:     { baseUrl: urls.ollama },
  }
  return map[providerKey] ?? {}
}

export function MediaProvider({ children, seriesSlug = 'default' }) {
  const { settings, getApiKey } = useSettings()
  const [characters, setCharacters] = useState({})
  const [scenes,     setScenes]     = useState({})
  const [dialogue,   setDialogue]   = useState({})
  const [sessionCost, setSessionCost] = useState(() => loadSessionCost())
  const portraitRefs = useRef({})

  const addCost = useCallback((type, provider, quality = 'hd') => {
    setSessionCost(prev => {
      const bucket = type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice'
      const delta  = getCost(type, provider, quality)
      const next   = { ...prev, [bucket]: (prev[bucket] ?? 0) + delta }
      saveSessionCost(next)
      return next
    })
  }, [])

  const addVoiceCost = useCallback((text, provider) => {
    setSessionCost(prev => {
      const next = { ...prev, voice: (prev.voice ?? 0) + getVoiceCost(text, provider) }
      saveSessionCost(next)
      return next
    })
  }, [])

  // ── Image ─────────────────────────────────────────────────────────────────
  const generateCharacterImage = useCallback(async (char, prompt, variationIndex = 0) => {
    const key = char.id
    setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const provider = settings.imageProvider
      const apiKey   = getApiKey(provider === 'fal.ai' ? 'falai' : provider)
      if (!apiKey && !['comfyui', 'a1111'].includes(provider)) throw new Error(`No API key set for ${provider}. Add it in Settings ⚙`)
      const preset = getPreset(settings.genrePreset)
      const { url } = await getImageProvider(provider)({
        prompt,
        aspectRatio:          settings.aspectRatio,
        imageQuality:         settings.imageQuality,
        apiKey,
        styleHint:            preset.fluxStyle,
        characterReferenceUrl: variationIndex > 0 ? portraitRefs.current[char.id] : undefined,
        ...localArgs(settings, provider),
      })
      const storeKey = mediaKey('char-img', seriesSlug, char.id, variationIndex)
      const localUrl = await fetchAndStore(storeKey, url)
      if (variationIndex === 0) portraitRefs.current[char.id] = localUrl || url
      setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', remoteUrl: url, localUrl: localUrl || url, error: null } }))
      addCost('image', provider, settings.imageQuality)
    } catch (err) {
      setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: err.message } }))
    }
  }, [settings, getApiKey, seriesSlug, addCost])

  // ── Video ─────────────────────────────────────────────────────────────────
  const generateSceneVideo = useCallback(async (epNum, scene, charIds = []) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const provider = settings.videoProvider
      const providerKey = { 'fal.ai': 'falai', klingdirect: 'klingdirect', lumaai: 'lumaai', minimax: 'minimax' }[provider] ?? provider
      const apiKey = getApiKey(providerKey)
      if (!apiKey && provider !== 'localvideo') throw new Error(`No API key set for ${provider}. Add it in Settings ⚙`)
      const preset    = getPreset(settings.genrePreset)
      const charRefUrl = charIds[0] ? portraitRefs.current[charIds[0]] : undefined
      const { url } = await getVideoProvider(provider)({
        prompt:               scene.kling_prompt,
        aspectRatio:          settings.aspectRatio,
        videoQuality:         settings.videoQuality,
        duration:             settings.videoDuration,
        apiKey,
        characterReferenceUrl: charRefUrl,
        styleHint:            preset.klingStyle,
        ...localArgs(settings, provider),
      })
      const storeKey = mediaKey('scene-vid', seriesSlug, `ep${epNum}`, `s${scene.scene_number}`)
      const localUrl = await fetchAndStore(storeKey, url)
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', remoteUrl: url, localUrl: localUrl || url, error: null } }))
      addCost('video', provider, settings.videoQuality)
    } catch (err) {
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: err.message } }))
    }
  }, [settings, getApiKey, seriesSlug, addCost])

  // ── Voice ─────────────────────────────────────────────────────────────────
  const generateDialogueVoice = useCallback(async (epNum, sceneNum, dIdx, line, voiceId) => {
    const key = `ep${epNum}-s${sceneNum}-d${dIdx}`
    setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const provider   = settings.voiceProvider
      const providerKey = provider === 'openaitts' ? 'openai' : provider === 'googletts' ? 'googletts' : provider
      const apiKey     = getApiKey(providerKey)
      if (!apiKey && !['kokoro', 'xtts'].includes(provider)) throw new Error(`No API key set for ${provider}. Add it in Settings ⚙`)
      const { audioBlob, audioUrl } = await getVoiceProvider(provider)({
        text:    line,
        voiceId,
        apiKey,
        imageQuality: settings.imageQuality,
        ...localArgs(settings, provider),
      })
      const storeKey = mediaKey('dialogue-audio', seriesSlug, `ep${epNum}`, `s${sceneNum}`, `d${dIdx}`)
      if (audioBlob) await fetchAndStore(storeKey, audioBlob)
      setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', audioUrl, error: null } }))
      addVoiceCost(line, provider)
    } catch (err) {
      setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: err.message } }))
    }
  }, [settings, getApiKey, seriesSlug, addVoiceCost])

  // ── Approval ──────────────────────────────────────────────────────────────
  const setCharApproval  = useCallback((id, s)  => setCharacters(prev => ({ ...prev, [id]: { ...(prev[id] ?? IDLE), approvalStatus: s } })), [])
  const setSceneApproval = useCallback((key, s) => setScenes(prev =>     ({ ...prev, [key]: { ...(prev[key] ?? IDLE), approvalStatus: s } })), [])

  // ── Batch ─────────────────────────────────────────────────────────────────
  const generateBatch = useCallback(async (series, mode = 'batch') => {
    for (const char of series.characters ?? []) {
      await generateCharacterImage(char, char.midjourney_prompt)
    }
    if (mode === 'batch') {
      for (const ep of series.episodes ?? []) {
        for (const scene of ep.scenes ?? []) {
          await generateSceneVideo(ep.number, scene, ep.characters_in_episode ?? [])
        }
      }
    }
    for (const ep of series.episodes ?? []) {
      for (const scene of ep.scenes ?? []) {
        for (let dIdx = 0; dIdx < (scene.dialogue?.length ?? 0); dIdx++) {
          await generateDialogueVoice(ep.number, scene.scene_number, dIdx, scene.dialogue[dIdx].line, null)
        }
      }
    }
  }, [generateCharacterImage, generateSceneVideo, generateDialogueVoice])

  return (
    <MediaContext.Provider value={{ characters, scenes, dialogue, sessionCost, generateCharacterImage, generateSceneVideo, generateDialogueVoice, generateBatch, setCharApproval, setSceneApproval, portraitRefs }}>
      {children}
    </MediaContext.Provider>
  )
}

MediaProvider.propTypes = { children: PropTypes.node.isRequired, seriesSlug: PropTypes.string }

export function useMedia() {
  const ctx = useContext(MediaContext)
  if (!ctx) throw new Error('useMedia must be used inside MediaProvider')
  return ctx
}
