// One-off: allowlist workspaces for managed generation (sets managedBeta=true).
// Usage: from server/  ->  node scripts/enable-managed.js [ownerEmail]
// With no arg, enables ALL workspaces (fine for a single-operator deployment).
// With an email, enables only workspaces that the matching user owns/belongs to.
import mongoose from 'mongoose'
import { config } from '../config.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'

const email = process.argv[2]

await mongoose.connect(config.mongoUri)
try {
  let filter = {}
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) { console.error(`No user with email ${email}`); process.exit(1) }
    filter = { 'members.userId': user._id }
  }
  const res = await Workspace.updateMany(filter, { $set: { managedBeta: true } })
  console.log(`Enabled managed generation (managedBeta=true) for ${res.modifiedCount} workspace(s)${email ? ` owned/joined by ${email}` : ' (all)'}.`)
} finally {
  await mongoose.disconnect()
}
