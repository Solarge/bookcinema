import mongoose from 'mongoose'

const memberSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:     { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false })

const inviteSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  role:      { type: String, enum: ['admin', 'member'], default: 'member' },
  token:     { type: String, required: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const workspaceSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  slug:    { type: String, unique: true, lowercase: true },
  type:    { type: String, enum: ['personal', 'organization'], default: 'personal' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan:    { type: String, enum: ['free', 'pro', 'studio'], default: 'free' },

  // Managed-generation beta allowlist — gates which tenants may spend platform money
  managedBeta: { type: Boolean, default: false },

  members: [memberSchema],
  invites: [inviteSchema],
  settings: {
    whiteLabel:      { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultLanguage: { type: String, default: 'en' },
  },

  // Idempotency marker for the Team->Workspace backfill
  migratedFromTeamId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
}, { timestamps: true })

// Auto-generate a unique-ish slug from name (random suffix avoids collisions for personal workspaces)
workspaceSchema.pre('save', function (next) {
  if (!this.slug) {
    const base = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
    this.slug = `${base}-${Math.random().toString(36).slice(2, 8)}`
  }
  next()
})

workspaceSchema.methods.hasMember = function (userId) {
  return this.members.some(m => m.userId.toString() === userId.toString())
}

workspaceSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(m => m.userId.toString() === userId.toString())
  return member?.role ?? null
}

export default mongoose.model('Workspace', workspaceSchema)
