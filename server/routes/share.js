import { Router } from 'express'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'
import { apiLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(apiLimiter)

// GET /api/share/:token — public read-only series view (no auth required)
router.get('/:token', async (req, res) => {
  try {
    const series = await Series.findOne({ shareToken: req.params.token, isPublic: true })
    if (!series) return res.status(404).json({ error: 'Share link not found or sharing has been disabled' })

    // Only assets that belong to the SAME workspace as the series may appear publicly.
    const assets = await Asset.find({ seriesId: series._id, workspaceId: series.workspaceId, approvalStatus: { $ne: 'rejected' } })
      .select('type assetKey s3Url provider quality')

    // Strip internal/tenant fields from the public payload.
    const safeSeries = series.toObject()
    delete safeSeries.userId
    delete safeSeries.workspaceId
    delete safeSeries.versions

    res.json({ series: safeSeries, assets })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
