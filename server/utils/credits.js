import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

// Atomic debit: requires monthly+purchased >= amount; draws monthly-first, then purchased.
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
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
  return { ok: true, balance: balanceAfter }
}

// Refund returns credits to the monthly bucket.
export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { monthlyCredits: amount } }, { new: true })
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
