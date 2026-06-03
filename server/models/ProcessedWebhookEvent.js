import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  type:    { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('ProcessedWebhookEvent', schema)
