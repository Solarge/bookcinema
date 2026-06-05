import { Router } from 'express'
import mongoose from 'mongoose'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { getPresignedUrl } from '../utils/s3.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

// Derive the S3 object key from a stored public URL (backward-compat for jobs
// created before resultKey was stored).
function keyFromUrl(url) {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')) } catch { return null }
}

// Media results live in a private bucket (Block Public Access on), so we hand the
// browser a short-lived presigned URL rather than the raw public URL (which 403s).
async function mediaUrl(job) {
  const key = job.resultKey || keyFromUrl(job.resultUrl)
  if (!key) return job.resultUrl || null
  try {
    return await getPresignedUrl(key, 3600)
  } catch (err) {
    console.warn('jobs presign failed, falling back to stored url:', err.message)
    return job.resultUrl || null
  }
}

async function view(job) {
  let result
  if (job.type === 'text') {
    result = { text: job.resultText }
  } else {
    result = { url: job.status === 'done' ? await mediaUrl(job) : job.resultUrl }
  }
  return {
    id: String(job._id), type: job.type, tier: job.tier, status: job.status,
    result, error: job.errorMessage, costUsd: job.costUsd, createdAt: job.createdAt,
  }
}

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const jobs = await Job.find({ workspaceId: req.workspace._id }).sort({ createdAt: -1 }).limit(limit)
    res.json(await Promise.all(jobs.map(view)))
  } catch (err) { console.error('jobs list error:', err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Job not found' })
    const job = await Job.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(await view(job))
  } catch (err) { console.error('jobs/:id error:', err); res.status(500).json({ error: 'Server error' }) }
})

export default router
