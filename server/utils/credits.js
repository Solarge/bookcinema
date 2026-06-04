import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

// Atomic debit: requires monthly+purchased >= amount; draws monthly-first, then purchased.
// Returns { ok, balance, fromMonthly, fromPurchased } so callers can refund to the correct bucket.
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
  // We need the pre-update state to compute bucket split, so read first then atomic update.
  // The $expr filter ensures atomicity: if balance drops below amount between read and update,
  // the update won't match and we return { ok: false }.
  const before = await Workspace.findOne(
    { _id: workspaceId, $expr: { $gte: [{ $add: ['$monthlyCredits', '$purchasedCredits'] }, amount] } },
    { monthlyCredits: 1, purchasedCredits: 1 },
  )
  if (!before) return { ok: false }
  // Compute how much comes from each bucket (monthly drawn first)
  const fromMonthly = Math.min(before.monthlyCredits, amount)
  const fromPurchased = amount - fromMonthly
  const ws = await Workspace.findOneAndUpdate(
    { _id: workspaceId, $expr: { $gte: [{ $add: ['$monthlyCredits', '$purchasedCredits'] }, amount] } },
    [{ $set: {
      purchasedCredits: { $cond: [ { $gte: ['$monthlyCredits', amount] }, '$purchasedCredits',
        { $subtract: ['$purchasedCredits', { $subtract: [amount, '$monthlyCredits'] }] } ] },
      monthlyCredits: { $max: [0, { $subtract: ['$monthlyCredits', amount] }] },
    } }],
    { new: true },
  )
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount: -amount, reason: 'debit', type, tier, jobId, balanceAfter })
  return { ok: true, balance: balanceAfter, fromMonthly, fromPurchased }
}

// Refund returns credits to the specified bucket ('monthly' | 'purchased', default 'monthly').
// Callers that know which bucket was drawn (via debitCredits return values) should pass the
// correct bucket. This prevents over-crediting the monthly allowance (which resets periodically)
// when purchased credits were actually consumed.
export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null, bucket = 'monthly' } = {}) {
  const field = bucket === 'purchased' ? 'purchasedCredits' : 'monthlyCredits'
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { [field]: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'refund', type, tier, jobId, balanceAfter })
  return { ok: true, balance: balanceAfter }
}

// Grant to a bucket: 'purchased' (packs) or 'monthly' (admin/allowance). Default purchased.
export async function grantCredits(workspaceId, amount, { note = '', bucket = 'purchased' } = {}) {
  const field = bucket === 'monthly' ? 'monthlyCredits' : 'purchasedCredits'
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { [field]: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'grant', balanceAfter, note })
  return { ok: true, balance: balanceAfter }
}
