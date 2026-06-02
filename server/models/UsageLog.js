import mongoose from 'mongoose'

const usageLogSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', default: null },

  action:   { type: String, required: true },  // 'generate_text' | 'generate_image' | 'generate_video' | 'generate_voice' | 'export'
  provider: { type: String, default: '' },
  quality:  { type: String, default: '' },
  model:    { type: String, default: '' },

  costUsd:     { type: Number, default: 0 },
  tokensUsed:  { type: Number, default: 0 },
  durationMs:  { type: Number, default: 0 },
  success:     { type: Boolean, default: true },
  errorMessage:{ type: String, default: null },

  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

// Static: get aggregated stats for a user
usageLogSchema.statics.getUserStats = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000)
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), createdAt: { $gte: since } } },
    { $group: {
      _id: null,
      totalCost:   { $sum: '$costUsd' },
      totalImages: { $sum: { $cond: [{ $eq: ['$action', 'generate_image'] }, 1, 0] } },
      totalVideos: { $sum: { $cond: [{ $eq: ['$action', 'generate_video'] }, 1, 0] } },
      totalVoice:  { $sum: { $cond: [{ $eq: ['$action', 'generate_voice'] }, 1, 0] } },
      totalSeries: { $sum: { $cond: [{ $eq: ['$action', 'generate_text'] }, 1, 0] } },
    }},
  ])
}

// Static: aggregated stats for a workspace
usageLogSchema.statics.getWorkspaceStats = async function (workspaceId, days = 30) {
  const since = new Date(Date.now() - days * 86400000)
  return this.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), createdAt: { $gte: since } } },
    { $group: {
      _id: null,
      totalCost:   { $sum: '$costUsd' },
      totalImages: { $sum: { $cond: [{ $eq: ['$action', 'generate_image'] }, 1, 0] } },
      totalVideos: { $sum: { $cond: [{ $eq: ['$action', 'generate_video'] }, 1, 0] } },
      totalVoice:  { $sum: { $cond: [{ $eq: ['$action', 'generate_voice'] }, 1, 0] } },
      totalSeries: { $sum: { $cond: [{ $eq: ['$action', 'generate_text'] }, 1, 0] } },
    }},
  ])
}

export default mongoose.model('UsageLog', usageLogSchema)
