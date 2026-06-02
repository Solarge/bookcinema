import { Router } from 'express'
import Series from '../models/Series.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { apiLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(requireAuth, resolveWorkspace, apiLimiter)

// GET /api/series — list the active workspace's series
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query
    const query = { workspaceId: req.workspace._id }
    if (search) query.title = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const [items, total] = await Promise.all([
      Series.find(query).select('-fullOutput -versions').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      Series.countDocuments(query),
    ])
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/series/:id
router.get('/:id', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    res.json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series — save generated series
router.post('/', async (req, res) => {
  try {
    const { title, author, logline, genrePreset, language, fullOutput, textProvider, totalCostUsd } = req.body
    if (!title || !fullOutput) return res.status(400).json({ error: 'title and fullOutput required' })
    const series = await Series.create({
      userId: req.user._id,
      workspaceId: req.workspace._id,
      title, author, logline, genrePreset, language, fullOutput, textProvider, totalCostUsd,
    })
    await UsageLog.create({ userId: req.user._id, workspaceId: req.workspace._id, seriesId: series._id, action: 'generate_text', provider: textProvider, costUsd: totalCostUsd ?? 0, success: true })
    res.status(201).json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/series/:id
router.put('/:id', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    const { title, fullOutput, tags, saveVersion, versionNote } = req.body
    if (saveVersion && series.fullOutput) series.saveVersion(versionNote)
    if (title)      series.title      = title
    if (fullOutput) series.fullOutput = fullOutput
    if (tags)       series.tags       = tags
    await series.save()
    res.json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/series/:id
router.delete('/:id', async (req, res) => {
  try {
    const series = await Series.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    const original = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!original) return res.status(404).json({ error: 'Series not found' })
    const copy = await Series.create({
      userId:      req.user._id,
      workspaceId: req.workspace._id,
      title:       `${original.title} (copy)`,
      author:      original.author,
      logline:     original.logline,
      genrePreset: original.genrePreset,
      language:    original.language,
      fullOutput:  original.fullOutput,
      textProvider:original.textProvider,
    })
    res.status(201).json(copy)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series/:id/share — enable public sharing
router.post('/:id/share', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    const token = series.enableSharing()
    await series.save()
    res.json({ shareToken: token, shareUrl: `/share/${token}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/series/:id/share — disable public sharing
router.delete('/:id/share', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    series.disableSharing()
    await series.save()
    res.json({ message: 'Sharing disabled' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
