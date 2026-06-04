import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { generationLimiter } from '../middleware/rateLimit.js'
import { addGenerationJob } from '../queue/generationQueue.js'
import { creditCost } from '../generation/creditCost.js'
import { debitCredits, refundCredits } from '../utils/credits.js'
import { planFeatures } from '../plans.js'
import { validateVideoUrl } from '../utils/urlGuard.js'

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
  const job = await Job.create({
    workspaceId: req.workspace._id, createdBy: req.user._id, type, tier, status: 'queued', params,
    debitMonthly: debit.fromMonthly ?? 0, debitPurchased: debit.fromPurchased ?? 0,
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
  return res.status(202).json({ jobId: String(job._id) })
}

router.post('/text', managedAccess('text'), async (req, res) => {
  try {
    const { bookText, genrePreset = 'cinematic', language = 'en', tier = 'standard' } = req.body
    if (!bookText) return res.status(400).json({ error: 'bookText is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    return await enqueueGeneration(req, res, { type: 'text', tier, params: { genrePreset, language }, payload: { bookText, genrePreset, language, tier } })
  } catch (err) { console.error('generate/text error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/voice
router.post('/voice', managedAccess('voice'), async (req, res) => {
  try {
    const { text, voiceId, tier = 'standard' } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    return await enqueueGeneration(req, res, { type: 'voice', tier, params: { text, voiceId: voiceId || null }, payload: { text, voiceId, tier } })
  } catch (err) { console.error('generate/voice error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/image
router.post('/image', managedAccess('image'), async (req, res) => {
  try {
    const { prompt, aspectRatio = '9:16', tier = 'standard' } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    return await enqueueGeneration(req, res, { type: 'image', tier, params: { prompt, aspectRatio }, payload: { prompt, aspectRatio, tier } })
  } catch (err) { console.error('generate/image error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/video
router.post('/video', managedAccess('video'), async (req, res) => {
  try {
    const { prompt, kling_prompt, aspectRatio = '9:16', duration = 5, tier = 'standard' } = req.body
    const effectivePrompt = prompt || kling_prompt
    if (!effectivePrompt) return res.status(400).json({ error: 'prompt is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    return await enqueueGeneration(req, res, {
      type: 'video', tier,
      params:  { prompt: effectivePrompt, aspectRatio, duration },
      payload: { prompt: effectivePrompt, aspectRatio, duration, tier },
    })
  } catch (err) { console.error('generate/video error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/compile
router.post('/compile', managedAccess('video'), async (req, res) => {
  try {
    const { seriesId, episodeNumber, clips } = req.body

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

    return await enqueueGeneration(req, res, {
      type: 'compile',
      tier: 'standard',
      params:  { seriesId: seriesId || null, episodeNumber: episodeNumber ?? null },
      payload: { clips, seriesId: seriesId || null, episodeNumber: episodeNumber ?? null },
    })
  } catch (err) {
    console.error('generate/compile error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
