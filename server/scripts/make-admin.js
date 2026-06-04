// One-off: promote a user to role 'admin'. Defaults to ADMIN_EMAIL from config.
// Usage: from server/  ->  node scripts/make-admin.js [email]
import mongoose from 'mongoose'
import { config } from '../config.js'
import User from '../models/User.js'

const email = (process.argv[2] || config.admin.email || '').toLowerCase()
if (!email) { console.error('No email given and ADMIN_EMAIL not set.'); process.exit(1) }

await mongoose.connect(config.mongoUri)
try {
  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'admin' } }, { new: true })
  if (!user) { console.error(`No user with email ${email}`); process.exit(1) }
  console.log(`Promoted ${email} to role '${user.role}'.`)
} finally {
  await mongoose.disconnect()
}
