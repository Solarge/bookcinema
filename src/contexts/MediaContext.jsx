import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from './SettingsContext'
import { useAuth } from './AuthContext'
import { getImageProvider, getVideoProvider, getVoiceProvider } from '../utils/mediaProviders/index'
import { fetchAndStore, getBlob } from '../utils/assetStore'
import { getCost, getVoiceCost, loadSessionCost, saveSessionCost } from '../utils/costTracker'
import { getPreset } from '../utils/genrePresets'
import { managed as managedApi, pollJob, assets as assetsApi } from '../lib/api'

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

// Map a storeKey (mediaKey result) to the canonical assetKey used when uploading.
// We reuse the storeKey directly — it's already a stable, unique identifier per slot.
function toAssetKey(storeKey) {
  return storeKey
}

// Determine a reasonable filename + content-type for a Blob before uploading.
// Falls back to generic types if the blob's own type is empty/unknown.
function blobMeta(blob, kind) {
  const type = blob.type || ''
  if (kind === 'image') {
    const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type) ? type : 'image/png'
    const ext = mime.split('/')[1].replace('jpeg', 'jpg')
    return { mime, filename: `asset.${ext}` }
  }
  if (kind === 'video') {
    const mime = ['video/mp4', 'video/webm', 'video/quicktime'].includes(type) ? type : 'video/mp4'
    const ext = mime === 'video/quicktime' ? 'mov' : mime.split('/')[1]
    return { mime, filename: `asset.${ext}` }
  }
  // audio
  const mime = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'].includes(type) ? type : 'audio/mpeg'
  const ext = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm' }[mime] || 'mp3'
  return { mime, filename: `asset.${ext}` }
}

export function MediaProvider({ children, seriesSlug = 'default', seriesId = null }) {
  const { settings, getApiKey } = useSettings()
  const { user } = useAuth()
  const [characters, setCharacters] = useState({})
  const [scenes,     setScenes]     = useState({})
  const [dialogue,   setDialogue]   = useState({})
  // Music: per-scene beds keyed `ep<n>-s<m>`; per-episode scores keyed `ep<n>`.
  const [sceneMusic,   setSceneMusic]   = useState({})
  const [episodeScore, setEpisodeScore] = useState({})
  const [sessionCost, setSessionCost] = useState(() => loadSessionCost())
  // Per-slot saving state: { [storeKey]: 'saving' | 'error' | undefined }
  const [saving, setSaving] = useState({})
  const portraitRefs = useRef({})

  // Latest-state refs — kept current on every render so async pipelines (assembleScene)
  // can read the freshest slot values for skip-checks without stale closures. The pipeline
  // itself threads fresh URLs via return values, so it never depends on post-setState timing.
  const scenesRef     = useRef(scenes)
  const dialogueRef   = useRef(dialogue)
  const sceneMusicRef = useRef(sceneMusic)
  scenesRef.current     = scenes
  dialogueRef.current   = dialogue
  sceneMusicRef.current = sceneMusic

  // Cloud sync is only active when authenticated AND a backend seriesId is available.
  const cloudEnabled = !!(user && seriesId)

  // ── Hydrate from cloud on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!cloudEnabled) return
    let cancelled = false
    ;(async () => {
      try {
        const serverAssets = await assetsApi.list(seriesId)
        if (cancelled || !Array.isArray(serverAssets)) return
        for (const sa of serverAssets) {
          const { _id, assetKey, s3Url, approvalStatus } = sa
          if (!assetKey) continue
          // assetKey matches the storeKey produced by mediaKey(). Parse the prefix.
          // Patterns:
          //   char-img:<slug>:<charId>:<variationIndex>
          //   scene-vid:<slug>:<ep>:<scene>
          //   dialogue-audio:<slug>:<ep>:<scene>:<dIdx>
          const parts = assetKey.split(':')
          const prefix = parts[0]
          // The presigned s3Url is the display source on reopen. Image/video render off
          // `localUrl`, audio off `audioUrl` — set them (plus status:'done') so a rehydrated
          // asset actually shows instead of falling back to the "Generate" button.
          const cloudPatch = { serverId: _id, serverUrl: s3Url, savedToCloud: true, status: 'done', error: null, approvalStatus: approvalStatus || 'pending' }
          if (prefix === 'char-img') {
            const charId = parts[2] // mediaKey('char-img', slug, charId, variationIndex)
            if (!charId) continue
            setCharacters(prev => ({
              ...prev,
              [charId]: { ...(prev[charId] ?? IDLE), ...cloudPatch, localUrl: s3Url, remoteUrl: s3Url },
            }))
          } else if (prefix === 'scene-vid') {
            // mediaKey('scene-vid', slug, 'ep<n>', 's<n>')
            const epPart = parts[2] // 'ep1'
            const sPart  = parts[3] // 's1'
            const key = `${epPart}-${sPart}` // 'ep1-s1'
            setScenes(prev => ({
              ...prev,
              [key]: { ...(prev[key] ?? IDLE), ...cloudPatch, localUrl: s3Url, remoteUrl: s3Url },
            }))
          } else if (prefix === 'dialogue-audio') {
            // mediaKey('dialogue-audio', slug, 'ep<n>', 's<n>', 'd<n>')
            const epPart  = parts[2]
            const sPart   = parts[3]
            const dPart   = parts[4]
            const key = `${epPart}-${sPart}-${dPart}`
            setDialogue(prev => ({
              ...prev,
              [key]: { ...(prev[key] ?? IDLE), ...cloudPatch, audioUrl: s3Url },
            }))
          } else if (prefix === 'scene-music') {
            // mediaKey('scene-music', slug, 'ep<n>', 's<n>')
            const epPart = parts[2]
            const sPart  = parts[3]
            const key = `${epPart}-${sPart}` // 'ep1-s1'
            setSceneMusic(prev => ({
              ...prev,
              [key]: { ...(prev[key] ?? IDLE), ...cloudPatch, audioUrl: s3Url },
            }))
          } else if (prefix === 'episode-score') {
            // mediaKey('episode-score', slug, 'ep<n>')
            const key = parts[2] // 'ep1'
            setEpisodeScore(prev => ({
              ...prev,
              [key]: { ...(prev[key] ?? IDLE), ...cloudPatch, audioUrl: s3Url },
            }))
          }
        }
      } catch (err) {
        console.warn('[MediaContext] cloud hydrate failed:', err)
      }
    })()
    return () => { cancelled = true }
  // We intentionally only run this once on mount (or when cloudEnabled flips on).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, seriesId])

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

  // ── Auto-persist a managed-generation job result as a cloud Asset ──────────
  // Managed media lives in S3 under the job result; promoting it to an Asset is what
  // lets a reopened series rehydrate it. Best-effort: never blocks/breaks generation.
  const persistJobAsset = useCallback(async (kind, slotKey, storeKey, jobId, meta = {}) => {
    if (!cloudEnabled || !jobId) return
    // Music kinds must tell the backend what flavour of asset this is.
    const assetType = kind === 'scene-music' ? 'scene_music' : kind === 'episode-score' ? 'episode_score' : undefined
    try {
      const result = await assetsApi.fromJob(seriesId, {
        jobId,
        assetKey:    toAssetKey(storeKey),
        provider:    meta.provider,
        quality:     meta.quality,
        aspectRatio: meta.aspectRatio,
        prompt:      meta.prompt,
        ...(assetType ? { assetType } : {}),
      })
      const patch = { serverId: result._id, serverUrl: result.s3Url, savedToCloud: true }
      if (kind === 'image')             setCharacters(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'video')        setScenes(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'scene-music')  setSceneMusic(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'episode-score') setEpisodeScore(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else                              setDialogue(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
    } catch (err) {
      console.warn('[MediaContext] auto-persist failed (asset can still be saved manually):', err)
    }
  }, [cloudEnabled, seriesId])

  // ── Image ─────────────────────────────────────────────────────────────────
  const generateCharacterImage = useCallback(async (char, prompt, variationIndex = 0) => {
    const key = char.id
    setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      let url
      let jobId = null
      if (settings.mode === 'managed') {
        ({ jobId } = await managedApi.generateImage({ prompt, aspectRatio: settings.aspectRatio, tier: settings.managedTier || 'standard' }))
        const job = await pollJob(jobId)
        if (job.status !== 'done' || !job.result?.url) throw new Error(job.error || 'Managed image generation failed')
        url = job.result.url
      } else {
        const provider = settings.imageProvider
        const apiKey   = getApiKey(provider === 'fal.ai' ? 'falai' : provider)
        if (!apiKey && !['comfyui', 'a1111'].includes(provider)) throw new Error(`No API key set for ${provider}. Add it in Settings ⚙`)
        const preset = getPreset(settings.genrePreset)
        ;({ url } = await getImageProvider(provider)({
          prompt,
          aspectRatio:           settings.aspectRatio,
          imageQuality:          settings.imageQuality,
          apiKey,
          styleHint:             preset.fluxStyle,
          characterReferenceUrl: variationIndex > 0 ? portraitRefs.current[char.id] : undefined,
          ...localArgs(settings, provider),
        }))
      }
      const storeKey = mediaKey('char-img', seriesSlug, char.id, variationIndex)
      const localUrl = await fetchAndStore(storeKey, url)
      if (variationIndex === 0) portraitRefs.current[char.id] = localUrl || url
      setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', remoteUrl: url, localUrl: localUrl || url, jobId, error: null } }))
      if (settings.mode !== 'managed') addCost('image', settings.imageProvider, settings.imageQuality)
      // Persist the main portrait so it survives a reload (variations share the char slot on hydrate).
      if (variationIndex === 0) await persistJobAsset('image', key, storeKey, jobId, { provider: 'managed', quality: settings.imageQuality, aspectRatio: settings.aspectRatio, prompt })
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Image generation requires a higher plan. Upgrade to unlock.')
        : err.message
      setCharacters(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
    }
  }, [settings, getApiKey, seriesSlug, addCost, persistJobAsset])

  // ── Video ─────────────────────────────────────────────────────────────────
  const generateSceneVideo = useCallback(async (epNum, scene, charIds = []) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      let url
      let jobId = null
      if (settings.mode === 'managed') {
        ({ jobId } = await managedApi.generateVideo({
          prompt:      scene.kling_prompt,
          aspectRatio: settings.aspectRatio,
          duration:    settings.videoDuration,
          tier:        settings.managedVideoTier || 'premium',
        }))
        const job = await pollJob(jobId)
        if (job.status !== 'done' || !job.result?.url) {
          const errMsg = job.error || 'Managed video generation failed'
          throw Object.assign(new Error(errMsg), { code: job.errorCode })
        }
        url = job.result.url
      } else {
        // BYO path — dormant in managed-only mode, kept for future re-enablement
        const provider = settings.videoProvider
        const providerKey = { 'fal.ai': 'falai', klingdirect: 'klingdirect', lumaai: 'lumaai', minimax: 'minimax' }[provider] ?? provider
        const apiKey = getApiKey(providerKey)
        if (!apiKey && provider !== 'localvideo') throw new Error(`No API key set for ${provider}.`)
        const preset    = getPreset(settings.genrePreset)
        const charRefUrl = charIds[0] ? portraitRefs.current[charIds[0]] : undefined
        ;({ url } = await getVideoProvider(provider)({
          prompt:               scene.kling_prompt,
          aspectRatio:          settings.aspectRatio,
          videoQuality:         settings.videoQuality,
          duration:             settings.videoDuration,
          apiKey,
          characterReferenceUrl: charRefUrl,
          styleHint:            preset.klingStyle,
          ...localArgs(settings, provider),
        }))
      }
      const storeKey = mediaKey('scene-vid', seriesSlug, `ep${epNum}`, `s${scene.scene_number}`)
      const localUrl = await fetchAndStore(storeKey, url)
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', remoteUrl: url, localUrl: localUrl || url, jobId, error: null } }))
      if (settings.mode !== 'managed') addCost('video', settings.videoProvider, settings.videoQuality)
      await persistJobAsset('video', key, storeKey, jobId, { provider: 'managed', aspectRatio: settings.aspectRatio, prompt: scene.kling_prompt })
      return localUrl || url
    } catch (err) {
      // Surface plan_feature 403 errors with a useful upgrade message
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Video generation requires a higher plan. Upgrade to unlock.')
        : err.message
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
      return null
    }
  }, [settings, getApiKey, seriesSlug, addCost, persistJobAsset])

  // ── Voice ─────────────────────────────────────────────────────────────────
  const generateDialogueVoice = useCallback(async (epNum, sceneNum, dIdx, line, voiceId) => {
    const key = `ep${epNum}-s${sceneNum}-d${dIdx}`
    setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const storeKey = mediaKey('dialogue-audio', seriesSlug, `ep${epNum}`, `s${sceneNum}`, `d${dIdx}`)
      let audioUrl
      let jobId = null
      if (settings.mode === 'managed') {
        ({ jobId } = await managedApi.generateVoice({ text: line, voiceId, tier: settings.managedTier || 'standard' }))
        const job = await pollJob(jobId)
        if (job.status !== 'done' || !job.result?.url) throw new Error(job.error || 'Managed voice generation failed')
        audioUrl = job.result.url
        await fetchAndStore(storeKey, audioUrl)
      } else {
        const provider    = settings.voiceProvider
        const providerKey  = provider === 'openaitts' ? 'openai' : provider === 'googletts' ? 'googletts' : provider
        const apiKey       = getApiKey(providerKey)
        if (!apiKey && !['kokoro', 'xtts'].includes(provider)) throw new Error(`No API key set for ${provider}. Add it in Settings ⚙`)
        const result = await getVoiceProvider(provider)({ text: line, voiceId, apiKey, imageQuality: settings.imageQuality, ...localArgs(settings, provider) })
        audioUrl = result.audioUrl
        if (result.audioBlob) await fetchAndStore(storeKey, result.audioBlob)
      }
      setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', audioUrl, jobId, error: null } }))
      if (settings.mode !== 'managed') addVoiceCost(line, settings.voiceProvider)
      await persistJobAsset('audio', key, storeKey, jobId, { provider: 'managed', prompt: line })
      return audioUrl
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Voice generation requires a higher plan. Upgrade to unlock.')
        : err.message
      setDialogue(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
      return null
    }
  }, [settings, getApiKey, seriesSlug, addVoiceCost, persistJobAsset])

  // ── Music: per-scene bed ────────────────────────────────────────────────────
  const generateSceneMusic = useCallback(async (epNum, scene) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    setSceneMusic(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const tier = settings.managedTier || 'standard'
      const { jobId } = await managedApi.generateMusic({ prompt: scene.music_prompt, duration: 8, tier })
      const job = await pollJob(jobId)
      if (job.status !== 'done' || !job.result?.url) throw new Error(job.error || 'Managed music generation failed')
      const url = job.result.url
      const storeKey = mediaKey('scene-music', seriesSlug, `ep${epNum}`, `s${scene.scene_number}`)
      const localUrl = await fetchAndStore(storeKey, url)
      setSceneMusic(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', audioUrl: localUrl || url, jobId, error: null } }))
      await persistJobAsset('scene-music', key, storeKey, jobId, { provider: 'managed', prompt: scene.music_prompt })
      return localUrl || url
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Music generation requires a higher plan. Upgrade to unlock.')
        : err.message
      setSceneMusic(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
      return null
    }
  }, [settings, seriesSlug, persistJobAsset])

  // ── Music: per-episode soundtrack score ─────────────────────────────────────
  const generateEpisodeSoundtrack = useCallback(async (epNum, episode) => {
    const key = `ep${epNum}`
    setEpisodeScore(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const tier = settings.managedTier || 'standard'
      const prompt = episode.soundtrack?.music_prompt
      const duration = episode.soundtrack?.duration_sec || 20
      const { jobId } = await managedApi.generateMusic({ prompt, duration, tier })
      const job = await pollJob(jobId)
      if (job.status !== 'done' || !job.result?.url) throw new Error(job.error || 'Managed soundtrack generation failed')
      const url = job.result.url
      const storeKey = mediaKey('episode-score', seriesSlug, `ep${epNum}`)
      const localUrl = await fetchAndStore(storeKey, url)
      setEpisodeScore(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', audioUrl: localUrl || url, jobId, error: null } }))
      await persistJobAsset('episode-score', key, storeKey, jobId, { provider: 'managed', prompt })
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Soundtrack generation requires a higher plan. Upgrade to unlock.')
        : err.message
      setEpisodeScore(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
    }
  }, [settings, seriesSlug, persistJobAsset])

  // ── Mux core: combine an explicit video URL with explicit voice/music URLs ───
  // Shared by addSceneSound (which reads URLs from state) and assembleScene (which
  // threads freshly-generated URLs). Produces a sounded clip and OVERWRITES the
  // scene_video slot (same assetKey) so the episode Compile stitches sounded clips.
  const muxSceneWithUrls = useCallback(async (epNum, scene, { videoUrl, voiceUrls = [], musicUrl = null }) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    if (!videoUrl) {
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), error: 'Generate the scene video first' } }))
      return
    }
    if ((voiceUrls?.length ?? 0) === 0 && !musicUrl) {
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), error: 'Generate voice and/or scene music first' } }))
      return
    }

    setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'generating', error: null } }))
    try {
      const { jobId } = await managedApi.mux({ videoUrl, voiceUrls, musicUrl })
      const job = await pollJob(jobId)
      if (job.status !== 'done' || !job.result?.url) {
        const errMsg = job.error || 'Adding sound failed'
        throw Object.assign(new Error(errMsg), { code: job.errorCode })
      }
      const muxedUrl = job.result.url
      const storeKey = mediaKey('scene-vid', seriesSlug, `ep${epNum}`, `s${scene.scene_number}`)
      const localUrl = await fetchAndStore(storeKey, muxedUrl)
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'done', localUrl: localUrl || muxedUrl, remoteUrl: muxedUrl, hasSound: true, jobId, error: null } }))
      // Overwrite the scene_video asset with the sounded clip (backend maps mux job → scene_video).
      await persistJobAsset('video', key, storeKey, jobId, { provider: 'managed', aspectRatio: settings.aspectRatio, prompt: scene.kling_prompt })
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Adding sound requires a higher plan. Upgrade to unlock.')
        : err.message
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
    }
  }, [settings.aspectRatio, seriesSlug, persistJobAsset])

  // ── Add Sound: gather the scene's already-generated URLs from state and mux ──
  const addSceneSound = useCallback(async (epNum, scene) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    const sceneSlot = scenes[key]
    const videoUrl = sceneSlot?.serverUrl || sceneSlot?.remoteUrl || sceneSlot?.localUrl
    if (!videoUrl) {
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), error: 'Generate the scene video first' } }))
      return
    }
    // Collect dialogue voice URLs for this scene. Dialogue slots are keyed
    // `${key}-d${i}` (see generateDialogueVoice), i over scene.dialogue.length.
    const voiceUrls = []
    const dialogueCount = scene.dialogue?.length ?? 0
    for (let i = 0; i < dialogueCount; i++) {
      const slot = dialogue[`${key}-d${i}`]
      const url = slot?.serverUrl || slot?.audioUrl
      if (url) voiceUrls.push(url)
    }
    const musicSlot = sceneMusic[key]
    const musicUrl = musicSlot?.serverUrl || musicSlot?.audioUrl || null
    if (voiceUrls.length === 0 && !musicUrl) {
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), error: 'Generate voice and/or scene music first' } }))
      return
    }
    await muxSceneWithUrls(epNum, scene, { videoUrl, voiceUrls, musicUrl })
  }, [scenes, dialogue, sceneMusic, muxSceneWithUrls])

  // ── Assemble Scene: one-click generate-what's-missing + mux ─────────────────
  // Threads freshly-generated URLs through return values (never reads them back from
  // state mid-pipeline), so it's immune to React stale-closure / batched-setState bugs.
  // Refs supply the initial skip-checks only.
  const assembleScene = useCallback(async (epNum, scene, charIds = []) => {
    const key = `ep${epNum}-s${scene.scene_number}`
    try {
      // 1) Video — reuse if present, else generate.
      const existing = scenesRef.current[key]
      let videoUrl = existing?.serverUrl || existing?.remoteUrl || existing?.localUrl
      if (!videoUrl) {
        videoUrl = await generateSceneVideo(epNum, scene, charIds)
      }
      if (!videoUrl) {
        setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: 'Could not generate the scene video' } }))
        return
      }

      // 2) Voices — one per dialogue line; reuse existing, else generate.
      const voiceUrls = []
      const dialogueCount = scene.dialogue?.length ?? 0
      for (let i = 0; i < dialogueCount; i++) {
        const dkey = `${key}-d${i}`
        const ex = dialogueRef.current[dkey]
        let vu = ex?.serverUrl || ex?.audioUrl
        if (!vu) vu = await generateDialogueVoice(epNum, scene.scene_number, i, scene.dialogue[i].line, null)
        if (vu) voiceUrls.push(vu)
      }

      // 3) Music — reuse existing, else generate when there's a prompt.
      const exM = sceneMusicRef.current[key]
      let musicUrl = exM?.serverUrl || exM?.audioUrl || null
      if (!musicUrl && scene.music_prompt) musicUrl = await generateSceneMusic(epNum, scene)

      // 4) Mux it all together via the shared core (explicit URLs — no state reads).
      await muxSceneWithUrls(epNum, scene, { videoUrl, voiceUrls, musicUrl })
    } catch (err) {
      const displayMsg = err.code === 'plan_feature'
        ? (err.message || 'Assembling the scene requires a higher plan. Upgrade to unlock.')
        : err.message
      setScenes(prev => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), status: 'error', error: displayMsg } }))
    }
  }, [generateSceneVideo, generateDialogueVoice, generateSceneMusic, muxSceneWithUrls])

  // ── Approval (with optional cloud sync) ──────────────────────────────────
  const setCharApproval = useCallback((id, s) => {
    setCharacters(prev => {
      const updated = { ...prev, [id]: { ...(prev[id] ?? IDLE), approvalStatus: s } }
      // Best-effort cloud sync
      const serverId = updated[id]?.serverId
      if (serverId) assetsApi.setApproval(serverId, s).catch(() => {})
      return updated
    })
  }, [])

  const setSceneApproval = useCallback((key, s) => {
    setScenes(prev => {
      const updated = { ...prev, [key]: { ...(prev[key] ?? IDLE), approvalStatus: s } }
      const serverId = updated[key]?.serverId
      if (serverId) assetsApi.setApproval(serverId, s).catch(() => {})
      return updated
    })
  }, [])

  // ── Save to cloud ─────────────────────────────────────────────────────────
  // kind: 'image' | 'video' | 'audio'
  // slotKey: the state map key (char.id, 'ep1-s1', 'ep1-s1-d0', etc.)
  // storeKey: the IndexedDB key (mediaKey output)
  const saveToCloud = useCallback(async (kind, slotKey, storeKey, meta = {}) => {
    if (!cloudEnabled) return
    // Music kinds carry an explicit assetType for the backend; they also persist as audio.
    const assetType = kind === 'scene-music' ? 'scene_music' : kind === 'episode-score' ? 'episode_score' : undefined
    const applyCloudPatch = (patch) => {
      if (kind === 'image')             setCharacters(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'video')        setScenes(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'scene-music')  setSceneMusic(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else if (kind === 'episode-score') setEpisodeScore(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
      else                              setDialogue(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] ?? IDLE), ...patch } }))
    }
    setSaving(prev => ({ ...prev, [storeKey]: 'saving' }))
    try {
      const blob = await getBlob(storeKey)
      if (!blob) {
        // Managed media isn't always cached locally (the S3 fetch can be CORS-blocked),
        // so promote the generation job's S3 result directly instead of re-uploading bytes.
        const slot = kind === 'image' ? characters[slotKey]
          : kind === 'video' ? scenes[slotKey]
          : kind === 'scene-music' ? sceneMusic[slotKey]
          : kind === 'episode-score' ? episodeScore[slotKey]
          : dialogue[slotKey]
        if (slot?.jobId) {
          const result = await assetsApi.fromJob(seriesId, {
            jobId: slot.jobId, assetKey: toAssetKey(storeKey),
            provider: meta.provider, quality: meta.quality, aspectRatio: meta.aspectRatio, prompt: meta.prompt,
            ...(assetType ? { assetType } : {}),
          })
          applyCloudPatch({ serverId: result._id, serverUrl: result.s3Url, savedToCloud: true })
          setSaving(prev => ({ ...prev, [storeKey]: undefined }))
          return
        }
        throw new Error('Asset not found in local store — generate it first.')
      }
      const { mime, filename } = blobMeta(blob, kind)
      const typedBlob = blob.type ? blob : new Blob([blob], { type: mime })
      const fd = new FormData()
      fd.append('file', typedBlob, filename)
      fd.append('assetKey', toAssetKey(storeKey))
      fd.append('provider', meta.provider || settings.imageProvider || '')
      if (meta.prompt)      fd.append('prompt', meta.prompt)
      if (meta.quality)     fd.append('quality', meta.quality)
      if (meta.aspectRatio) fd.append('aspectRatio', meta.aspectRatio)
      if (meta.costUsd != null) fd.append('costUsd', String(meta.costUsd))
      if (assetType) fd.append('assetType', assetType)

      let result
      if (kind === 'image') result = await assetsApi.uploadImage(seriesId, fd)
      else if (kind === 'video') result = await assetsApi.uploadVideo(seriesId, fd)
      else result = await assetsApi.uploadAudio(seriesId, fd)

      applyCloudPatch({ serverId: result._id, serverUrl: result.s3Url, savedToCloud: true })
      setSaving(prev => ({ ...prev, [storeKey]: undefined }))
    } catch (err) {
      setSaving(prev => ({ ...prev, [storeKey]: 'error:' + err.message }))
      // Surface the error message briefly then clear it
      setTimeout(() => setSaving(prev => ({ ...prev, [storeKey]: undefined })), 8000)
      console.warn('[MediaContext] saveToCloud failed:', err)
    }
  }, [cloudEnabled, seriesId, settings.imageProvider, characters, scenes, dialogue, sceneMusic, episodeScore])

  // ── Delete from cloud ─────────────────────────────────────────────────────
  const deleteFromCloud = useCallback(async (kind, slotKey) => {
    if (!cloudEnabled) return
    const getServerId = () => {
      if (kind === 'image')         return characters[slotKey]?.serverId
      if (kind === 'video')         return scenes[slotKey]?.serverId
      if (kind === 'scene-music')   return sceneMusic[slotKey]?.serverId
      if (kind === 'episode-score') return episodeScore[slotKey]?.serverId
      return dialogue[slotKey]?.serverId
    }
    const serverId = getServerId()
    if (!serverId) return
    try {
      await assetsApi.delete(serverId)
    } catch (err) {
      console.warn('[MediaContext] deleteFromCloud failed:', err)
    }
    const clearCloud = slot => ({ ...slot, serverId: undefined, serverUrl: undefined, savedToCloud: false })
    if (kind === 'image')             setCharacters(prev => ({ ...prev, [slotKey]: clearCloud(prev[slotKey] ?? IDLE) }))
    else if (kind === 'video')        setScenes(prev => ({ ...prev, [slotKey]: clearCloud(prev[slotKey] ?? IDLE) }))
    else if (kind === 'scene-music')  setSceneMusic(prev => ({ ...prev, [slotKey]: clearCloud(prev[slotKey] ?? IDLE) }))
    else if (kind === 'episode-score') setEpisodeScore(prev => ({ ...prev, [slotKey]: clearCloud(prev[slotKey] ?? IDLE) }))
    else setDialogue(prev => ({ ...prev, [slotKey]: clearCloud(prev[slotKey] ?? IDLE) }))
  }, [cloudEnabled, characters, scenes, dialogue, sceneMusic, episodeScore])

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

  // Expose a helper so components can build a storeKey without duplicating mediaKey logic.
  const getMediaKey = useCallback((...args) => mediaKey(...args), [])

  return (
    <MediaContext.Provider value={{
      characters, scenes, dialogue, sceneMusic, episodeScore, sessionCost,
      generateCharacterImage, generateSceneVideo, generateDialogueVoice, generateBatch,
      generateSceneMusic, generateEpisodeSoundtrack,
      addSceneSound,
      assembleScene,
      setCharApproval, setSceneApproval,
      portraitRefs,
      // Cloud sync
      cloudEnabled,
      seriesSlug,
      saving,
      saveToCloud,
      deleteFromCloud,
      getMediaKey,
    }}>
      {children}
    </MediaContext.Provider>
  )
}

MediaProvider.propTypes = {
  children: PropTypes.node.isRequired,
  seriesSlug: PropTypes.string,
  seriesId: PropTypes.string,
}

export function useMedia() {
  const ctx = useContext(MediaContext)
  if (!ctx) throw new Error('useMedia must be used inside MediaProvider')
  return ctx
}
