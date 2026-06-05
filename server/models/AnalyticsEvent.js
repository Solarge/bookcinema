import mongoose from 'mongoose'

const analyticsEventSchema = new mongoose.Schema({
  event:       { type: String, required: true, index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',      default: null, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
  props:       { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

// Fast window queries for funnel aggregation
analyticsEventSchema.index({ event: 1, createdAt: 1 })
analyticsEventSchema.index({ createdAt: 1 })

export default mongoose.model('AnalyticsEvent', analyticsEventSchema)
