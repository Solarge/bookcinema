import { Router } from 'express'
import UsageLog from '../models/UsageLog.js'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/analytics — usage summary
router.get('/', async (req, res) => {
  try {
    const days = Number(req.query.days) || 30
    const [stats] = await UsageLog.getUserStats(req.user._id, days)
    const seriesCount = await Series.countDocuments({ userId: req.user._id })
    const assetCount  = await Asset.countDocuments({ userId: req.user._id })
    res.json({ stats: stats || { totalCost: 0, totalImages: 0, totalVideos: 0, totalVoice: 0, totalSeries: 0 }, seriesCount, assetCount, days })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/analytics/history — daily breakdown
router.get('/history', async (req, res) => {
  try {
    const days = Number(req.query.days) || 30
    const since = new Date(Date.now() - days * 86400000)
    const logs = await UsageLog.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since } } },
      { $group: {
        _id:    { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        cost:   { $sum: '$costUsd' },
        images: { $sum: { $cond: [{ $eq: ['$action', 'generate_image'] }, 1, 0] } },
        videos: { $sum: { $cond: [{ $eq: ['$action', 'generate_video'] }, 1, 0] } },
        voice:  { $sum: { $cond: [{ $eq: ['$action', 'generate_voice'] }, 1, 0] } },
      }},
      { $sort: { _id: -1 } },
    ])
    res.json(logs)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/analytics/providers — which providers are used most
router.get('/providers', async (req, res) => {
  try {
    const breakdown = await UsageLog.aggregate([
      { $match: { userId: req.user._id } },
      { $group: {
        _id:        { action: '$action', provider: '$provider' },
        count:      { $sum: 1 },
        totalCost:  { $sum: '$costUsd' },
        successRate:{ $avg: { $cond: ['$success', 1, 0] } },
      }},
      { $sort: { count: -1 } },
    ])
    res.json(breakdown)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/analytics/export.csv
router.get('/export.csv', async (req, res) => {
  try {
    const logs = await UsageLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(10000).lean()
    const headers = ['Date', 'Action', 'Provider', 'Quality', 'Cost (USD)', 'Success']
    const rows = logs.map(l => [
      l.createdAt.toISOString().split('T')[0],
      l.action, l.provider, l.quality,
      l.costUsd.toFixed(6), l.success ? 'yes' : 'no',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=bookfilm-analytics.csv')
    res.send(csv)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
