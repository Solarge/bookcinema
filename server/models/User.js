import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 12, select: false },
  name:     { type: String, required: true, trim: true },
  avatar:   { type: String, default: '' },

  role:     { type: String, enum: ['user', 'admin', 'agency'], default: 'user' },
  plan:     { type: String, enum: ['free', 'pro', 'studio'], default: 'free' },
  credits:  { type: Number, default: 10 },     // manual credit system

  defaultWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },

  // API key for programmatic access (hashed)
  apiKeyHash:   { type: String, default: null, select: false },
  apiKeyPrefix: { type: String, default: null },  // first 8 chars for display

  // Password reset
  resetToken:   { type: String, default: null, select: false },
  resetExpires: { type: Date,   default: null },

  // Preferences (language, theme, etc.)
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },

  lastLoginAt: { type: Date, default: null },
  isActive:    { type: Boolean, default: true },

  // GDPR consent — stamped at registration
  consentedAt: { type: Date, default: null },

  // Email verification
  emailVerifiedAt: { type: Date, default: null },

  // Login lockout (brute-force protection)
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil:         { type: Date,   default: null },
}, { timestamps: true })

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password)
}

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject()
  delete obj.password
  delete obj.apiKeyHash
  delete obj.resetToken
  delete obj.resetExpires
  return obj
}

export default mongoose.model('User', userSchema)
