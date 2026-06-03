import mongoose from 'mongoose'

const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin']

const socialAccountSchema = new mongoose.Schema({
  workspaceId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Workspace',
    required: true,
    index:    true,
  },
  platform: {
    type:     String,
    enum:     PLATFORMS,
    required: true,
  },
  externalId: {
    type:     String,
    required: true,
  },
  displayName: {
    type: String,
    default: '',
  },
  // Encrypted OAuth tokens — NEVER exposed to clients
  accessTokenEnc: {
    type:     String,
    default:  null,
  },
  refreshTokenEnc: {
    type:     String,
    default:  null,
  },
  expiresAt: {
    type:    Date,
    default: null,
  },
  scopes: [{ type: String }],
  connectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  },
}, { timestamps: true })

// Unique constraint: one account per platform+channel per workspace
socialAccountSchema.index(
  { workspaceId: 1, platform: 1, externalId: 1 },
  { unique: true },
)

/**
 * Safe serialisation for API responses.
 * NEVER includes accessTokenEnc or refreshTokenEnc.
 */
socialAccountSchema.methods.toClient = function () {
  return {
    id:          this._id,
    platform:    this.platform,
    displayName: this.displayName,
    expiresAt:   this.expiresAt,
    connectedAt: this.createdAt,
  }
}

export default mongoose.model('SocialAccount', socialAccountSchema)
