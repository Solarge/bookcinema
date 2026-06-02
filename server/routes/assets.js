import { Router } from 'express'
import Asset from '../models/Asset.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth } from '../middleware/auth.js'
import { uploadImage, uploadVideo, uploadAudio } from '../middleware/upload.js'
import { uploadLimiter } from '../middleware/rateLimit.js'
import { deleteObject } from '../utils/s3.js'

const router = Router()
router.use(requireAuth)

// GET /api/assets/:seriesId — list all assets for a series
router.get('/:seriesId', async (req, res) => {
  try {
    const assets = await Asset.find({ seriesId: req.params.seriesId }).sort({ createdAt: 1 })
    res.json(assets)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/image
router.post('/:seriesId/image', uploadLimiter, (req, res, next) => {
  uploadImage.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const { assetKey, provider, quality, aspectRatio, prompt, costUsd } = req.body
    const asset = await Asset.create({
      userId:   req.user._id,
      seriesId: req.params.seriesId,
      teamId:   req.user.teamId,
      type:     'character_image',
      assetKey: assetKey || file.key,
      s3Key:    file.key,
      s3Url:    file.location,
      s3Bucket: file.bucket,
      mimeType: file.mimetype,
      sizeBytes:file.size,
      provider, quality, aspectRatio, prompt,
      costUsd:  Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, seriesId: req.params.seriesId, action: 'generate_image', provider, quality, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/video
router.post('/:seriesId/video', uploadLimiter, (req, res, next) => {
  uploadVideo.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const { assetKey, provider, quality, aspectRatio, prompt, costUsd } = req.body
    const asset = await Asset.create({
      userId: req.user._id, seriesId: req.params.seriesId, teamId: req.user.teamId,
      type: 'scene_video', assetKey: assetKey || file.key,
      s3Key: file.key, s3Url: file.location, s3Bucket: file.bucket,
      mimeType: file.mimetype, sizeBytes: file.size,
      provider, quality, aspectRatio, prompt, costUsd: Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, seriesId: req.params.seriesId, action: 'generate_video', provider, quality, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/audio
router.post('/:seriesId/audio', uploadLimiter, (req, res, next) => {
  uploadAudio.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const { assetKey, provider, costUsd } = req.body
    const asset = await Asset.create({
      userId: req.user._id, seriesId: req.params.seriesId, teamId: req.user.teamId,
      type: 'dialogue_audio', assetKey: assetKey || file.key,
      s3Key: file.key, s3Url: file.location, s3Bucket: file.bucket,
      mimeType: file.mimetype, sizeBytes: file.size,
      provider, costUsd: Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, seriesId: req.params.seriesId, action: 'generate_voice', provider, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/assets/:id/approval
router.patch('/:id/approval', async (req, res) => {
  try {
    const { status } = req.body
    const allowed = ['pending', 'approved', 'flagged', 'rejected']
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid approval status' })
    const asset = await Asset.findByIdAndUpdate(req.params.id, { approvalStatus: status, approvedBy: req.user._id }, { new: true })
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    res.json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/assets/:id
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user._id })
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    await deleteObject(asset.s3Key)
    await asset.deleteOne()
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
