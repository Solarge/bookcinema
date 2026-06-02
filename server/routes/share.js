import { Router } from 'express'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'

const router = Router()

// GET /api/share/:token — public read-only series view (no auth required)
router.get('/:token', async (req, res) => {
  try {
    const series = await Series.findOne({ shareToken: req.params.token, isPublic: true })
      .select('-versions -userId -workspaceId')
    if (!series) return res.status(404).json({ error: 'Share link not found or sharing has been disabled' })

    // Get publicly accessible assets
    const assets = await Asset.find({ seriesId: series._id, approvalStatus: { $ne: 'rejected' } })
      .select('type assetKey s3Url provider quality')

    res.json({ series, assets })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
