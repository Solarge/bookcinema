// Create (or update) a COMPANY SUPER-ADMIN user for the separate /admin portal.
// Usage:  node scripts/create-admin-user.js <email> <password> [name]
// Defaults to the Solarge company admin. Creates a personal workspace if new.
// NOTE: bypasses the 12-char password policy (direct DB creation) — login doesn't
// enforce length. Use a strong password in production.
import mongoose from 'mongoose'
import { config } from '../config.js'
import User from '../models/User.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

const email    = (process.argv[2] || 'solargeapartment@gmail.com').toLowerCase()
const password = process.argv[3] || 'Test123@'
const name     = process.argv[4] || 'Solarge Admin'

await mongoose.connect(config.mongoUri)
try {
  let user = await User.findOne({ email }).select('+password')
  if (user) {
    user.password = password // re-hashed by the pre-save hook
    user.role = 'admin'
    user.isActive = true
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date()
    await user.save({ validateBeforeSave: false })
    console.log(`Updated existing user ${email} → role 'admin', password reset.`)
  } else {
    user = new User({
      name, email, password, role: 'admin',
      emailVerifiedAt: new Date(), consentedAt: new Date(), ageConfirmedAt: new Date(),
    })
    await user.save({ validateBeforeSave: false }) // skip 12-char minlength; hash hook still runs
    await createPersonalWorkspace(user)
    console.log(`Created company super-admin ${email} (role 'admin') + personal workspace.`)
  }
} finally {
  await mongoose.disconnect()
}
