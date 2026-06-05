import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

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

  monthlyCredits:   { type: Number, default: 25, min: 0 },
  purchasedCredits: { type: Number, default: 0,  min: 0 },
  creditPeriod: { type: String, default: null },

  stripeCustomerId:     { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },

  // Billing lifecycle state
  paymentPastDue:       { type: Boolean, default: false },
  // Track "low credit" notification to avoid spamming — reset on monthly refill
  lowCreditNotifiedAt:  { type: Date, default: null },

  members: [memberSchema],
  invites: [inviteSchema],
  settings: {
    whiteLabel:      { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultLanguage: { type: String, default: 'en' },
  },

  // Idempotency marker for the Team->Workspace backfill
  migratedFromTeamId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
}, { timestamps: true })

// Generate a unique slug from the name with a uuid-derived suffix.
// Suffix gives ~48 bits of entropy so the unique index never realistically collides.
// (Deliberately no isModified('name') guard: regenerate whenever slug is unset.)
workspaceSchema.pre('save', function (next) {
  if (!this.slug) {
    const base = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
    this.slug = `${base}-${uuidv4().replace(/-/g, '').slice(0, 12)}`
  }
  next()
})

workspaceSchema.virtual('creditBalance').get(function () { return (this.monthlyCredits || 0) + (this.purchasedCredits || 0) })
workspaceSchema.set('toJSON', { virtuals: true })
workspaceSchema.set('toObject', { virtuals: true })

// Resolve a member's user id whether members.userId is a raw ObjectId or a
// populated User document. Routes that .populate('members.userId') would otherwise
// break the comparison, since a populated doc's toString() isn't the id hex.
function memberUserId(m) {
  const u = m.userId
  return (u && u._id ? u._id : u)?.toString()
}

workspaceSchema.methods.hasMember = function (userId) {
  const uid = userId?.toString()
  return this.members.some(m => memberUserId(m) === uid)
}

workspaceSchema.methods.getMemberRole = function (userId) {
  const uid = userId?.toString()
  const member = this.members.find(m => memberUserId(m) === uid)
  return member?.role ?? null
}

export default mongoose.model('Workspace', workspaceSchema)
