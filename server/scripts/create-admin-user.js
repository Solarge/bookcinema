// Create (or update) a COMPANY SUPER-ADMIN user for the separate /admin portal.
// Usage:  node scripts/create-admin-user.js [email] <password> [name]
//
// The PASSWORD is required and must be supplied as a CLI argument (no default).
// It must be at least 16 characters long.
//
// Examples:
//   node scripts/create-admin-user.js mypassword_min16chars
//   node scripts/create-admin-user.js admin@example.com mypassword_min16chars "My Name"
//
// Argument detection: if the first arg looks like an email address it is treated
// as the email; otherwise the email defaults to the company address and the first
// arg is the password.
import mongoose from 'mongoose'
import { config } from '../config.js'
import User from '../models/User.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

// ── Argument parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)

let email, password, name

// Detect whether the first positional looks like an email
const looksLikeEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

if (args.length === 0) {
  console.error('Usage: node scripts/create-admin-user.js [email] <password> [name]')
  console.error('  password is REQUIRED and must be at least 16 characters.')
  process.exit(1)
}

if (looksLikeEmail(args[0])) {
  // node create-admin-user.js email password [name]
  email    = args[0].toLowerCase()
  password = args[1]
  name     = args[2] || 'Solarge Admin'
} else {
  // node create-admin-user.js password [name]
  email    = 'solargeapartment@gmail.com'
  password = args[0]
  name     = args[1] || 'Solarge Admin'
}

if (!password) {
  console.error('Error: password is required.')
  console.error('Usage: node scripts/create-admin-user.js [email] <password> [name]')
  process.exit(1)
}

if (password.length < 16) {
  console.error(`Error: password must be at least 16 characters (got ${password.length}).`)
  process.exit(1)
}

// ── Database operations ───────────────────────────────────────────────────────
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
