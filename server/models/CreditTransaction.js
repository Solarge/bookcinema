import mongoose from 'mongoose'

const creditTxSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  amount:      { type: Number, required: true }, // signed: negative = debit, positive = grant/refund
  reason:      { type: String, enum: ['grant', 'debit', 'refund'], required: true },
  type:        { type: String, default: null },
  tier:        { type: String, default: null },
  jobId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
  balanceAfter:{ type: Number, required: true },
  note:        { type: String, default: '' },
}, { timestamps: true })

creditTxSchema.index({ workspaceId: 1, createdAt: -1 })

export default mongoose.model('CreditTransaction', creditTxSchema)
