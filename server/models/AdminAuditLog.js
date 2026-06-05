import mongoose from 'mongoose'

const adminAuditLogSchema = new mongoose.Schema({
  actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  actorEmail: { type: String, default: '' },
  action:     { type: String, required: true },
  targetType: { type: String, default: '' },
  targetId:   { type: String, default: '' },
  // detail: before/after diffs, amount/value, any relevant context
  detail:     { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt:  { type: Date, default: Date.now, index: { expires: false } },
}, {
  // Suppress the auto-generated updatedAt — audit entries are immutable.
  timestamps: false,
})

adminAuditLogSchema.index({ createdAt: -1 })

export default mongoose.model('AdminAuditLog', adminAuditLogSchema)
