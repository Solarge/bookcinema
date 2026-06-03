import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { addGenerationJob } from '../queue/generationQueue.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

router.post('/text', managedAccess('text'), async (req, res) => {
  try {
    const { bookText, genrePreset = 'cinematic', language = 'en', tier = 'standard' } = req.body
    if (!bookText) return res.status(400).json({ error: 'bookText is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    const job = await Job.create({
      workspaceId: req.workspace._id,
      createdBy: req.user._id,
      type: 'text', tier, status: 'queued',
      params: { genrePreset, language },
    })

    try {
      const queue = req.app.locals.generationQueue
      const bull = await addGenerationJob({ type: 'text', tier, payload: { bookText, genrePreset, language }, workspaceId: String(req.workspace._id), createdBy: String(req.user._id), jobId: String(job._id) }, queue)
      job.bullJobId = bull?.id ? String(bull.id) : null
      await job.save()
    } catch (qErr) {
      job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
      await job.save()
      return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
    }

    res.status(202).json({ jobId: String(job._id) })
  } catch (err) { console.error('generate/text error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/voice
router.post('/voice', managedAccess('voice'), async (req, res) => {
  try {
    const { text, voiceId, tier = 'standard' } = req.body
    if (!text) return res.status(400).json({ error: 'text is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    const job = await Job.create({
      workspaceId: req.workspace._id, createdBy: req.user._id,
      type: 'voice', tier, status: 'queued', params: { voiceId: voiceId || null },
    })
    try {
      const queue = req.app.locals.generationQueue
      const bull = await addGenerationJob({ jobId: String(job._id), type: 'voice', tier, payload: { text, voiceId }, workspaceId: String(req.workspace._id), createdBy: String(req.user._id) }, queue)
      job.bullJobId = bull?.id ? String(bull.id) : null
      await job.save()
    } catch (qErr) {
      job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
      await job.save()
      return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
    }
    res.status(202).json({ jobId: String(job._id) })
  } catch (err) { console.error('generate/voice error:', err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/generate/image
router.post('/image', managedAccess('image'), async (req, res) => {
  try {
    const { prompt, aspectRatio = '9:16', tier = 'standard' } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    const job = await Job.create({
      workspaceId: req.workspace._id, createdBy: req.user._id,
      type: 'image', tier, status: 'queued', params: { aspectRatio },
    })
    try {
      const queue = req.app.locals.generationQueue
      const bull = await addGenerationJob({ jobId: String(job._id), type: 'image', tier, payload: { prompt, aspectRatio }, workspaceId: String(req.workspace._id), createdBy: String(req.user._id) }, queue)
      job.bullJobId = bull?.id ? String(bull.id) : null
      await job.save()
    } catch (qErr) {
      job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
      await job.save()
      return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
    }
    res.status(202).json({ jobId: String(job._id) })
  } catch (err) { console.error('generate/image error:', err); res.status(500).json({ error: 'Server error' }) }
})

export default router
