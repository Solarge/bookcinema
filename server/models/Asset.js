import mongoose from 'mongoose'

const assetSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  type:    { type: String, enum: ['character_image', 'scene_video', 'dialogue_audio', 'export'], required: true },
  assetKey:{ type: String, required: true }, // e.g., 'char:sarah', 'ep1-s2', 'ep1-s2-d0'

  // S3 storage
  s3Key:     { type: String, required: true },
  s3Url:     { type: String, required: true },
  s3Bucket:  { type: String, required: true },
  mimeType:  { type: String, default: 'application/octet-stream' },
  sizeBytes: { type: Number, default: 0 },

  // Generation metadata
  provider:    { type: String, default: '' },
  quality:     { type: String, default: 'hd' },
  aspectRatio: { type: String, default: '9:16' },
  prompt:      { type: String, default: '' },
  costUsd:     { type: Number, default: 0 },

  // Approval workflow
  approvalStatus: { type: String, enum: ['pending', 'approved', 'flagged', 'rejected'], default: 'pending' },
  approvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

assetSchema.index({ seriesId: 1, assetKey: 1 })

export default mongoose.model('Asset', assetSchema)
