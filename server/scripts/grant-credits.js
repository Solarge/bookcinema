// One-off: grant managed-generation credits to a workspace.
// Usage: from server/  ->  node scripts/grant-credits.js <amount> [ownerEmail] [bucket]
//   amount     credits to add (integer)
//   ownerEmail target the workspace this user owns/belongs to; omit to grant to ALL workspaces
//   bucket     'purchased' (default — never resets) | 'monthly' (resets on refill)
// Examples:
//   node scripts/grant-credits.js 1000 solargeapartment@gmail.com
//   node scripts/grant-credits.js 500            # all workspaces, purchased bucket
import mongoose from 'mongoose'
import { config } from '../config.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { grantCredits } from '../utils/credits.js'

const amount = Math.round(Number(process.argv[2]))
const email  = process.argv[3]
const bucket = process.argv[4] === 'monthly' ? 'monthly' : 'purchased'

if (!Number.isFinite(amount) || amount <= 0) {
  console.error('Usage: node scripts/grant-credits.js <amount> [ownerEmail] [bucket]')
  process.exit(1)
}

await mongoose.connect(config.mongoUri)
try {
  let filter = {}
  if (email) {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) { console.error(`No user with email ${email}`); process.exit(1) }
    filter = { 'members.userId': user._id }
  }
  const workspaces = await Workspace.find(filter, { _id: 1, name: 1 })
  if (workspaces.length === 0) { console.error('No matching workspaces.'); process.exit(1) }
  for (const ws of workspaces) {
    const res = await grantCredits(ws._id, amount, { note: 'manual grant (grant-credits.js)', bucket })
    console.log(`+${amount} ${bucket} credits → "${ws.name || ws._id}"  (balance now ${res.balance})`)
  }
} finally {
  await mongoose.disconnect()
}
