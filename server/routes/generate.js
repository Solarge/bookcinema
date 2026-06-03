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

export default router
