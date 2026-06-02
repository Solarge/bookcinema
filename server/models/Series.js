import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const seriesSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  title:       { type: String, required: true, trim: true },
  author:      { type: String, default: '' },
  logline:     { type: String, default: '' },
  genrePreset: { type: String, default: 'cinematic' },
  language:    { type: String, default: 'en' },

  // Full generated JSON from Claude/LLM
  fullOutput: { type: mongoose.Schema.Types.Mixed, required: true },

  // Versioning — array of previous fullOutput snapshots
  versions: [{
    savedAt:    { type: Date, default: Date.now },
    fullOutput: { type: mongoose.Schema.Types.Mixed },
    note:       { type: String, default: '' },
  }],

  // Public sharing
  shareToken: { type: String, unique: true, sparse: true, default: null },
  isPublic:   { type: Boolean, default: false },

  // Generation metadata
  textProvider:  { type: String, default: 'anthropic' },
  totalCostUsd:  { type: Number, default: 0 },

  tags: [{ type: String }],
}, { timestamps: true })

// Auto-generate share token
seriesSchema.methods.enableSharing = function () {
  if (!this.shareToken) this.shareToken = uuidv4().replace(/-/g, '').slice(0, 16)
  this.isPublic = true
  return this.shareToken
}

seriesSchema.methods.disableSharing = function () {
  this.isPublic = false
}

// Save a version snapshot
seriesSchema.methods.saveVersion = function (note = '') {
  this.versions.push({ fullOutput: this.fullOutput, note, savedAt: new Date() })
  if (this.versions.length > 20) this.versions.shift() // keep last 20
}

export default mongoose.model('Series', seriesSchema)
