import mongoose from 'mongoose'

const jobSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: ['text', 'refine', 'image', 'voice', 'video', 'music', 'compile', 'mux'], required: true },
  tier:        { type: String, enum: ['standard', 'premium'], default: 'standard' },
  status:      { type: String, enum: ['queued', 'active', 'done', 'failed'], default: 'queued', index: true },

  params:      { type: mongoose.Schema.Types.Mixed, default: {} },

  resultText:  { type: String, default: null },
  resultUrl:   { type: String, default: null },
  // S3 object key for media results — presigned at read-time so the bucket can keep
  // Block Public Access on. resultUrl is kept for backward-compat / fallback.
  resultKey:   { type: String, default: null },

  costUsd:      { type: Number, default: 0 },
  errorMessage: { type: String, default: null },
  bullJobId:    { type: String, default: null },

  // Bucket breakdown of the debit so the refund path can restore to the correct bucket.
  debitMonthly:    { type: Number, default: null },
  debitPurchased:  { type: Number, default: null },
}, { timestamps: true })

jobSchema.index({ workspaceId: 1, createdAt: -1 })
jobSchema.index({ workspaceId: 1, type: 1, createdAt: -1 })

export default mongoose.model('Job', jobSchema)
