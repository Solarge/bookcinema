import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

// Atomic conditional debit: only succeeds if balance >= amount (no race).
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: workspaceId, creditBalance: { $gte: amount } },
    { $inc: { creditBalance: -amount } },
    { new: true },
  )
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount: -amount, reason: 'debit', type, tier, jobId, balanceAfter: ws.creditBalance })
  return { ok: true, balance: ws.creditBalance }
}

export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { creditBalance: amount } }, { new: true })
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount, reason: 'refund', type, tier, jobId, balanceAfter: ws.creditBalance })
  return { ok: true, balance: ws.creditBalance }
}

export async function grantCredits(workspaceId, amount, { note = '' } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { creditBalance: amount } }, { new: true })
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount, reason: 'grant', balanceAfter: ws.creditBalance, note })
  return { ok: true, balance: ws.creditBalance }
}
