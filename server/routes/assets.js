import { Router } from 'express'
import Asset from '../models/Asset.js'
import Series from '../models/Series.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { uploadImage, uploadVideo, uploadAudio } from '../middleware/upload.js'
import { uploadLimiter } from '../middleware/rateLimit.js'
import { deleteObject, getPresignedUrl } from '../utils/s3.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

// Replace the stored public s3Url with a short-lived presigned URL the browser can
// actually load (the bucket keeps Block Public Access on). Falls back to the stored
// URL if signing fails for any reason.
async function withSignedUrl(asset) {
  const obj = typeof asset.toObject === 'function' ? asset.toObject() : asset
  if (!obj.s3Key) return obj
  try {
    return { ...obj, s3Url: await getPresignedUrl(obj.s3Key, 3600) }
  } catch (err) {
    console.warn('assets presign failed, falling back to stored url:', err.message)
    return obj
  }
}

// GET /api/assets/:seriesId — list assets for a series in the active workspace
router.get('/:seriesId', async (req, res) => {
  try {
    const assets = await Asset.find({ seriesId: req.params.seriesId, workspaceId: req.workspace._id }).sort({ createdAt: 1 })
    res.json(await Promise.all(assets.map(withSignedUrl)))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/image
router.post('/:seriesId/image', uploadLimiter, (req, res, next) => {
  uploadImage.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const ownsSeries = await Series.exists({ _id: req.params.seriesId, workspaceId: req.workspace._id })
    if (!ownsSeries) {
      if (file?.key) await deleteObject(file.key)
      return res.status(404).json({ error: 'Series not found' })
    }
    const { assetKey, provider, quality, aspectRatio, prompt, costUsd } = req.body
    const asset = await Asset.create({
      userId:      req.user._id,
      workspaceId: req.workspace._id,
      seriesId:    req.params.seriesId,
      type:        'character_image',
      assetKey:    assetKey || file.key,
      s3Key:       file.key,
      s3Url:       file.location,
      s3Bucket:    file.bucket,
      mimeType:    file.mimetype,
      sizeBytes:   file.size,
      provider, quality, aspectRatio, prompt,
      costUsd:     Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId, action: 'generate_image', provider, quality, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/video
router.post('/:seriesId/video', uploadLimiter, (req, res, next) => {
  uploadVideo.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const ownsSeries = await Series.exists({ _id: req.params.seriesId, workspaceId: req.workspace._id })
    if (!ownsSeries) {
      if (file?.key) await deleteObject(file.key)
      return res.status(404).json({ error: 'Series not found' })
    }
    const { assetKey, provider, quality, aspectRatio, prompt, costUsd } = req.body
    const asset = await Asset.create({
      userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId,
      type: 'scene_video', assetKey: assetKey || file.key,
      s3Key: file.key, s3Url: file.location, s3Bucket: file.bucket,
      mimeType: file.mimetype, sizeBytes: file.size,
      provider, quality, aspectRatio, prompt, costUsd: Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId, action: 'generate_video', provider, quality, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/audio
router.post('/:seriesId/audio', uploadLimiter, (req, res, next) => {
  uploadAudio.single('file')(req, res, err => { if (err) return res.status(400).json({ error: err.message }); next() })
}, async (req, res) => {
  try {
    const file = req.file
    const ownsSeries = await Series.exists({ _id: req.params.seriesId, workspaceId: req.workspace._id })
    if (!ownsSeries) {
      if (file?.key) await deleteObject(file.key)
      return res.status(404).json({ error: 'Series not found' })
    }
    const { assetKey, provider, costUsd } = req.body
    const asset = await Asset.create({
      userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId,
      type: 'dialogue_audio', assetKey: assetKey || file.key,
      s3Key: file.key, s3Url: file.location, s3Bucket: file.bucket,
      mimeType: file.mimetype, sizeBytes: file.size,
      provider, costUsd: Number(costUsd) || 0,
    })
    await UsageLog.create({ userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId, action: 'generate_voice', provider, costUsd: asset.costUsd })
    res.status(201).json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/assets/:id/approval
router.patch('/:id/approval', async (req, res) => {
  try {
    const { status } = req.body
    const allowed = ['pending', 'approved', 'flagged', 'rejected']
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid approval status' })
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.workspace._id },
      { approvalStatus: status, approvedBy: req.user._id },
      { new: true }
    )
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    res.json(asset)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/assets/:id
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    await deleteObject(asset.s3Key)
    await asset.deleteOne()
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
