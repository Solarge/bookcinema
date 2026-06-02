import mongoose from 'mongoose'

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:   { type: String, enum: ['owner', 'admin', 'editor', 'viewer'], default: 'editor' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false })

const inviteSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  role:      { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor' },
  token:     { type: String, required: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const teamSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  slug:    { type: String, unique: true, lowercase: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan:    { type: String, enum: ['pro', 'studio'], default: 'pro' },
  members: [memberSchema],
  invites: [inviteSchema],
  settings: {
    whiteLabel: { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultLanguage: { type: String, default: 'en' },
  },
}, { timestamps: true })

// Auto-generate slug from name
teamSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }
  next()
})

teamSchema.methods.hasMember = function (userId) {
  return this.members.some(m => m.userId.toString() === userId.toString())
}

teamSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(m => m.userId.toString() === userId.toString())
  return member?.role ?? null
}

export default mongoose.model('Team', teamSchema)
