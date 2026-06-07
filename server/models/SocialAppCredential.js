import mongoose from 'mongoose'

const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin']

/**
 * Per-workspace social developer-app credentials.
 *
 * Each tenant (workspace) supplies their OWN platform app's client id/secret.
 * The credential VALUES (client_id, client_secret, etc.) are JSON-stringified
 * and encrypted at rest via cryptoTokens (AES-256-GCM) into `valuesEnc`.
 * Plaintext values are NEVER stored and NEVER returned to clients.
 */
const socialAppCredentialSchema = new mongoose.Schema({
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
  // encryptToken(JSON.stringify({ <key>: <value>, ... })) — NEVER exposed to clients
  valuesEnc: {
    type:     String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  },
}, { timestamps: true })

// One credential row per platform per workspace.
socialAppCredentialSchema.index(
  { workspaceId: 1, platform: 1 },
  { unique: true },
)

export default mongoose.model('SocialAppCredential', socialAppCredentialSchema)
