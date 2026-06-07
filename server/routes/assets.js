import { Router } from 'express'
import mongoose from 'mongoose'
import Asset from '../models/Asset.js'
import CharacterAsset from '../models/CharacterAsset.js'
import Series from '../models/Series.js'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { uploadImage, uploadVideo, uploadAudio } from '../middleware/upload.js'
import { uploadLimiter } from '../middleware/rateLimit.js'
import { deleteObject, getPresignedUrl } from '../utils/s3.js'
import { config } from '../config.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

// Managed generation job type → Asset type
const JOB_TYPE_TO_ASSET = { image: 'character_image', video: 'scene_video', voice: 'dialogue_audio', audio: 'dialogue_audio', music: 'scene_music', mux: 'scene_video', compile: 'episode_compiled' }

// Valid Asset.type enum values — used to validate an optional caller-supplied assetType override.
const ASSET_TYPES = new Set(Asset.schema.path('type').enumValues)

// Derive the S3 object key from a stored public URL (for jobs/assets created before
// resultKey/s3Key was stored, or by an older worker build).
function keyFromUrl(url) {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')) } catch { return null }
}

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

// Resolve the canonical character REFERENCE portrait for (workspace, series, character)
// as a short-lived presigned URL. Returns null when there's no registered reference
// (or signing fails). Used by the generate route to plumb `characterRef` to the engine.
export async function getCharacterRefUrl(workspaceId, seriesId, characterId) {
  try {
    if (!workspaceId || !seriesId || !characterId) return null
    const ref = await CharacterAsset.findOne({ workspaceId, seriesId, characterId })
    if (!ref?.s3Key) return null
    return await getPresignedUrl(ref.s3Key, 3600)
  } catch (err) {
    console.warn('getCharacterRefUrl failed:', err.message)
    return null
  }
}

// GET /api/assets/:seriesId/characters — list the canonical character REFERENCE
// portraits for a series in the active workspace, each with a presigned s3Url.
router.get('/:seriesId/characters', async (req, res) => {
  try {
    const refs = await CharacterAsset.find({ seriesId: req.params.seriesId, workspaceId: req.workspace._id }).sort({ createdAt: 1 })
    res.json(await Promise.all(refs.map(withSignedUrl)))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/assets/:seriesId — list assets for a series in the active workspace
router.get('/:seriesId', async (req, res) => {
  try {
    const assets = await Asset.find({ seriesId: req.params.seriesId, workspaceId: req.workspace._id }).sort({ createdAt: 1 })
    res.json(await Promise.all(assets.map(withSignedUrl)))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/assets/:seriesId/from-job — promote a completed managed generation job's
// S3 result into a persisted Asset, referencing the existing object (no re-upload, no
// browser CORS dependency). Idempotent per (series, assetKey) so regenerating a slot
// updates the existing asset rather than piling up duplicates.
router.post('/:seriesId/from-job', async (req, res) => {
  try {
    const { jobId, assetKey, provider, quality, aspectRatio, prompt, assetType: requestedAssetType } = req.body
    if (!jobId || !assetKey) return res.status(400).json({ error: 'jobId and assetKey are required' })
    if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ error: 'Invalid jobId' })

    const ownsSeries = await Series.exists({ _id: req.params.seriesId, workspaceId: req.workspace._id })
    if (!ownsSeries) return res.status(404).json({ error: 'Series not found' })

    const job = await Job.findOne({ _id: jobId, workspaceId: req.workspace._id })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    // Accept resultKey, or derive it from the stored public URL (older worker builds).
    const s3Key = job.resultKey || keyFromUrl(job.resultUrl)
    if (job.status !== 'done' || !s3Key) return res.status(409).json({ error: 'Job has no stored result' })

    // Honor an explicit assetType override when it's a valid Asset.type enum value
    // (e.g. a 'music' job saved as 'episode_score' rather than the default 'scene_music').
    // Otherwise fall back to the job-type default mapping.
    const assetType = (requestedAssetType && ASSET_TYPES.has(requestedAssetType))
      ? requestedAssetType
      : JOB_TYPE_TO_ASSET[job.type]
    if (!assetType) return res.status(400).json({ error: `Job type '${job.type}' cannot be saved as an asset` })

    const fields = {
      userId: req.user._id, workspaceId: req.workspace._id, seriesId: req.params.seriesId,
      type: assetType, assetKey,
      s3Key, s3Url: job.resultUrl, s3Bucket: config.aws.bucketName,
      provider: provider || '', quality: quality || 'hd', aspectRatio: aspectRatio || '9:16', prompt: prompt || '',
      costUsd: job.costUsd || 0,
    }
    const asset = await Asset.findOneAndUpdate(
      { seriesId: req.params.seriesId, workspaceId: req.workspace._id, assetKey },
      fields,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    // Character memory: when a character portrait is promoted, register/refresh the
    // canonical REFERENCE for (seriesId, characterId) so generation can pass it to the
    // engine. assetKey shape: 'char-img:<slug>:<charId>:<variationIndex>' (variation
    // segment may be absent). Best-effort — never fail the main request.
    if (asset.type === 'character_image' && assetKey.startsWith('char-img:')) {
      try {
        const characterId = assetKey.split(':')[2]
        if (characterId) {
          await CharacterAsset.findOneAndUpdate(
            { seriesId: req.params.seriesId, characterId },
            { workspaceId: req.workspace._id, seriesId: req.params.seriesId, characterId, s3Key: asset.s3Key, s3Url: asset.s3Url, createdBy: req.user._id },
            { upsert: true, setDefaultsOnInsert: true }
          )
        }
      } catch (e) { console.warn('character ref upsert failed (non-fatal):', e.message) }
    }

    res.status(201).json(await withSignedUrl(asset))
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
