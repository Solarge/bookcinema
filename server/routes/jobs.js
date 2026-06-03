import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

function view(job) {
  return {
    id: String(job._id), type: job.type, tier: job.tier, status: job.status,
    result: job.type === 'text' ? { text: job.resultText } : { url: job.resultUrl },
    error: job.errorMessage, costUsd: job.costUsd, createdAt: job.createdAt,
  }
}

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const jobs = await Job.find({ workspaceId: req.workspace._id }).sort({ createdAt: -1 }).limit(limit)
    res.json(jobs.map(view))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(view(job))
  } catch (err) { res.status(404).json({ error: 'Job not found' }) }
})

export default router
