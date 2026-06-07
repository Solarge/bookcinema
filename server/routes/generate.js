import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { generationLimiter } from '../middleware/rateLimit.js'
import { addGenerationJob } from '../queue/generationQueue.js'
import { creditCost } from '../generation/creditCost.js'
import { estCostFor } from '../generation/registry.js'
import { debitCredits, refundCredits } from '../utils/credits.js'
import { planFeatures } from '../plans.js'
import { validateVideoUrl } from '../utils/urlGuard.js'
import { getCharacterRefUrl } from './assets.js'
import { moderateText } from '../utils/moderation.js'
import { config } from '../config.js'
import { track } from '../utils/track.js'

const router = Router()
router.use(requireAuth, resolveWorkspace, generationLimiter)

async function enqueueGeneration(req, res, { type, tier, params, payload }) {
  if (tier === 'premium' && !planFeatures(req.workspace.plan).premium) {
    return res.status(403).json({ error: 'Premium tier requires the Pro or Studio plan' })
  }

  let cost
  try { cost = creditCost(type, tier) } catch { return res.status(400).json({ error: 'Invalid tier' }) }

  const debit = await debitCredits(req.workspace._id, cost, { type, tier })
  if (!debit.ok) return res.status(402).json({ error: 'Insufficient credits' })

  // Persist which bucket(s) the debit drew from so a terminal-failure refund restores
  // the same buckets (otherwise refunds always fall back to 'purchased').
  // costUsd is the ESTIMATED provider cost (not exact — provider billing APIs are not polled;
  // used for spend visibility and the platform daily spend cap check).
  const job = await Job.create({
    workspaceId: req.workspace._id, createdBy: req.user._id, type, tier, status: 'queued', params,
    debitMonthly: debit.fromMonthly ?? 0, debitPurchased: debit.fromPurchased ?? 0,
    costUsd: estCostFor(type, tier),
  })
  try {
    const queue = req.app.locals.generationQueue
    const bull = await addGenerationJob({ jobId: String(job._id), type, tier, payload, workspaceId: String(req.workspace._id), createdBy: String(req.user._id) }, queue)
    job.bullJobId = bull?.id ? String(bull.id) : null
    await job.save()
  } catch (qErr) {
    job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
    await job.save()
    // Refund to the exact buckets debited.
    if (debit.fromMonthly) await refundCredits(req.workspace._id, debit.fromMonthly, { jobId: job._id, type, tier, bucket: 'monthly' })
    if (debit.fromPurchased) await refundCredits(req.workspace._id, debit.fromPurchased, { jobId: job._id, type, tier, bucket: 'purchased' })
    return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
  }
  await track('generation', { userId: req.user._id, workspaceId: req.workspace._id, props: { type, tier } })
  return res.status(202).json({ jobId: String(job._id), creditsCharged: cost, creditsRemaining: debit.balance })
}

// Character consistency: resolve an OPTIONAL reference portrait URL the engine adapter
// can use to keep a character looking the same across scenes. Accepts an explicit
// `characterRef` URL, or a `characterId` (+ `seriesId`) to look up the canonical
// CharacterAsset reference. Validated with the SSRF guard; an invalid/absent value
// resolves to null (current behavior). Cloud adapters simply ignore characterRef.
async function resolveCharacterRef({ characterRef, characterId, seriesId, workspaceId }) {
  let ref = (typeof characterRef === 'string' && characterRef) ? characterRef : null
  if (!ref && characterId && seriesId) {
    ref = await getCharacterRefUrl(workspaceId, seriesId, characterId)
  }
  if (!ref) return null
  const check = validateVideoUrl(ref)
  return check.ok ? ref : null
}

router.post('/text', managedAccess('text'), async (req, res) => {
  try {
    const { bookText, genrePreset = 'cinematic', language = 'en', tier = 'standard', rightsConfirmed, episodeCount: rawEpisodeCount } = req.body
    if (!bookText) return res.status(400).json({ error: 'bookText is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    // Episode count: 'auto' (default) lets the book decide; a positive number forces that count
    // (the prompt builder sanity-caps it). Don't streamline to a fixed range.
    const num = Math.round(Number(rawEpisodeCount))
    const episodeCount = Number.isFinite(num) && num > 0 ? num : 'auto'

    // Copyright assertion — server-enforced. The client HomeScreen passes rightsConfirmed:true
    // after the user acknowledges the copyright notice. Must be checked BEFORE moderation/debit.
    if (rightsConfirmed !== true) {
      return res.status(400).json({
        error: 'You must confirm you have the rights to use this text or that it is in the public domain.',
        code: 'rights_required',
      })
    }

    // bookText length cap — reduces copyright-volume and cost exposure.
    // Cap is configurable via MANAGED_MAX_BOOKTEXT_CHARS env var (default 30 000).
    const maxChars = config.managed.maxBookTextChars
    if (bookText.length > maxChars) {
      return res.status(400).json({
        error: `Input is too long (max ${maxChars} characters). Please use an excerpt.`,
        code: 'too_long',
      })
    }

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(bookText)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    return await enqueueGeneration(req, res, { type: 'text', tier, params: { genrePreset, language, episodeCount }, payload: { bookText, genrePreset, language, tier, episodeCount } })
  } catch (err) { console.error('generate/text error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/refine — "Director's Chat": answer a question about the
// current series OR revise it per a plain-English instruction. Text op available
// on every plan that has text, so gate on managedAccess('text'). Mirrors POST
// /voice for the moderation/debit/validation shape.
router.post('/refine', managedAccess('text'), async (req, res) => {
  try {
    const { instruction, currentSeries, tier = 'standard', language = 'en' } = req.body
    if (!instruction || typeof instruction !== 'string') return res.status(400).json({ error: 'instruction is required' })
    if (instruction.length > 2000) return res.status(400).json({ error: 'instruction is too long (max 2000 characters)' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    // currentSeries must be the full series JSON the client currently holds.
    if (!currentSeries || typeof currentSeries !== 'object' || Array.isArray(currentSeries)) {
      return res.status(400).json({ error: 'currentSeries is required (the full series JSON object)' })
    }
    if (!currentSeries.title || !Array.isArray(currentSeries.episodes)) {
      return res.status(400).json({ error: 'currentSeries must include a title and an episodes array' })
    }

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(instruction)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    return await enqueueGeneration(req, res, {
      type: 'refine', tier,
      params:  { instruction },
      payload: { currentSeries, instruction, tier, language },
    })
  } catch (err) { console.error('generate/refine error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/voice
router.post('/voice', managedAccess('voice'), async (req, res) => {
  try {
    const { text, voiceId, tier = 'standard' } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(text)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    return await enqueueGeneration(req, res, { type: 'voice', tier, params: { text, voiceId: voiceId || null }, payload: { text, voiceId, tier } })
  } catch (err) { console.error('generate/voice error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/music — generate a music bed / soundtrack score.
// Mirrors POST /voice for moderation/debit/validation shape.
router.post('/music', managedAccess('music'), async (req, res) => {
  try {
    const { prompt, duration: rawDuration = 20, tier = 'standard' } = req.body
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' })
    if (prompt.length > 2000) return res.status(400).json({ error: 'prompt is too long (max 2000 characters)' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    // Clamp duration to 3–60 seconds (default 20).
    const num = Number(rawDuration)
    const duration = Number.isFinite(num) ? Math.min(60, Math.max(3, Math.round(num))) : 20

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(prompt)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    return await enqueueGeneration(req, res, { type: 'music', tier, params: { prompt, duration }, payload: { prompt, duration, tier } })
  } catch (err) { console.error('generate/music error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/image
router.post('/image', managedAccess('image'), async (req, res) => {
  try {
    const { prompt, aspectRatio = '9:16', tier = 'standard', characterRef, characterId, seriesId } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(prompt)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    // Optional character-consistency reference (see resolveCharacterRef). null = current behavior.
    const charRef = await resolveCharacterRef({ characterRef, characterId, seriesId, workspaceId: req.workspace._id })

    return await enqueueGeneration(req, res, { type: 'image', tier, params: { prompt, aspectRatio }, payload: { prompt, aspectRatio, tier, characterRef: charRef } })
  } catch (err) { console.error('generate/image error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/video
router.post('/video', managedAccess('video'), async (req, res) => {
  try {
    const { prompt, kling_prompt, aspectRatio = '9:16', duration = 5, tier = 'standard', characterRef, characterId, seriesId } = req.body
    const effectivePrompt = prompt || kling_prompt
    if (!effectivePrompt) return res.status(400).json({ error: 'prompt is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    // Server-side moderation — runs BEFORE credit debit so blocked content is never charged.
    const mod = await moderateText(effectivePrompt)
    if (mod.flagged) {
      return res.status(422).json({
        error: 'This content violates our usage policy and cannot be generated.',
        code: 'content_blocked',
      })
    }

    // Optional character-consistency reference (see resolveCharacterRef). null = current behavior.
    const charRef = await resolveCharacterRef({ characterRef, characterId, seriesId, workspaceId: req.workspace._id })

    return await enqueueGeneration(req, res, {
      type: 'video', tier,
      params:  { prompt: effectivePrompt, aspectRatio, duration },
      payload: { prompt: effectivePrompt, aspectRatio, duration, tier, characterRef: charRef },
    })
  } catch (err) { console.error('generate/video error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/compile
router.post('/compile', managedAccess('video'), async (req, res) => {
  try {
    const { seriesId, episodeNumber, clips, soundtrackUrl, title } = req.body

    // Validate clips array
    if (!Array.isArray(clips) || clips.length < 2) {
      return res.status(400).json({ error: 'clips must be an array of at least 2 video URLs' })
    }

    // SSRF guard: validate every clip URL
    for (let i = 0; i < clips.length; i++) {
      const check = validateVideoUrl(clips[i])
      if (!check.ok) {
        return res.status(400).json({ error: `Invalid clip URL at index ${i}: ${check.reason}` })
      }
    }

    // Optional soundtrack score muxed under the concatenated audio. Same SSRF guard as clips.
    if (soundtrackUrl != null) {
      const check = validateVideoUrl(soundtrackUrl)
      if (!check.ok) {
        return res.status(400).json({ error: `Invalid soundtrack URL: ${check.reason}` })
      }
    }

    return await enqueueGeneration(req, res, {
      type: 'compile',
      tier: 'standard',
      params:  { seriesId: seriesId || null, episodeNumber: episodeNumber ?? null },
      payload: { clips, soundtrackUrl: soundtrackUrl || null, seriesId: seriesId || null, episodeNumber: episodeNumber ?? null, title: typeof title === 'string' ? title : null },
    })
  } catch (err) {
    console.error('generate/compile error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/generate/mux — mux dialogue voice line(s) + a music bed onto a
// (silent) scene video clip via ffmpeg. Pure post-process; reuses the 'video'
// feature gate and compile's flat/cheap ffmpeg credit treatment.
router.post('/mux', managedAccess('video'), async (req, res) => {
  try {
    const { videoUrl, voiceUrls, musicUrl, musicVolume } = req.body

    // videoUrl is required and SSRF-validated.
    const vCheck = validateVideoUrl(videoUrl)
    if (!vCheck.ok) {
      return res.status(400).json({ error: `Invalid video URL: ${vCheck.reason}` })
    }

    const voices = Array.isArray(voiceUrls) ? voiceUrls.filter(v => v != null && v !== '') : []

    // Require at least one audio source: a non-empty voiceUrls or a musicUrl.
    if (voices.length === 0 && (musicUrl == null || musicUrl === '')) {
      return res.status(400).json({ error: 'At least one of voiceUrls or musicUrl is required' })
    }

    // SSRF guard: validate every voice URL.
    for (let i = 0; i < voices.length; i++) {
      const check = validateVideoUrl(voices[i])
      if (!check.ok) {
        return res.status(400).json({ error: `Invalid voice URL at index ${i}: ${check.reason}` })
      }
    }

    // SSRF guard: validate the optional music URL.
    if (musicUrl != null && musicUrl !== '') {
      const check = validateVideoUrl(musicUrl)
      if (!check.ok) {
        return res.status(400).json({ error: `Invalid music URL: ${check.reason}` })
      }
    }

    const vol = Number(musicVolume)
    const effectiveVolume = Number.isFinite(vol) ? vol : 0.3

    return await enqueueGeneration(req, res, {
      type: 'mux',
      tier: 'standard',
      params:  { hasVoices: voices.length > 0, hasMusic: !!(musicUrl && musicUrl !== '') },
      payload: { videoUrl, voiceUrls: voices, musicUrl: musicUrl || null, musicVolume: effectiveVolume },
    })
  } catch (err) {
    console.error('generate/mux error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/generate/estimate?type=&tier=
// Returns the credit cost + estimated provider cost for a type/tier combination,
// without debiting any credits. Used by the client to show pre-generation cost info.
// managedAccess is intentionally NOT applied — this is read-only and lightweight.
router.get('/estimate', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const { type, tier = 'standard' } = req.query
    if (!type) return res.status(400).json({ error: 'type is required' })
    let credits
    try { credits = creditCost(type, tier) } catch { return res.status(400).json({ error: 'Invalid type or tier' }) }
    const est = estCostFor(type, tier)
    return res.json({ type, tier, credits, estCostUsd: est })
  } catch (err) {
    console.error('generate/estimate error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
