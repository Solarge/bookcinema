import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { addGenerationJob } from '../queue/generationQueue.js'
import { creditCost } from '../generation/creditCost.js'
import { debitCredits, refundCredits } from '../utils/credits.js'
import { planFeatures } from '../plans.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

async function enqueueGeneration(req, res, { type, tier, params, payload }) {
  if (tier === 'premium' && !planFeatures(req.workspace.plan).premium) {
    return res.status(403).json({ error: 'Premium tier requires the Pro or Studio plan' })
  }

  let cost
  try { cost = creditCost(type, tier) } catch { return res.status(400).json({ error: 'Invalid tier' }) }

  const debit = await debitCredits(req.workspace._id, cost, { type, tier })
  if (!debit.ok) return res.status(402).json({ error: 'Insufficient credits' })

  const job = await Job.create({ workspaceId: req.workspace._id, createdBy: req.user._id, type, tier, status: 'queued', params })
  try {
    const queue = req.app.locals.generationQueue
    const bull = await addGenerationJob({ jobId: String(job._id), type, tier, payload, workspaceId: String(req.workspace._id), createdBy: String(req.user._id) }, queue)
    job.bullJobId = bull?.id ? String(bull.id) : null
    await job.save()
  } catch (qErr) {
    job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
    await job.save()
    await refundCredits(req.workspace._id, cost, { jobId: job._id, type, tier })
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

export default router
