import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { resolve as defaultResolve } from '../generation/resolve.js'

export async function processGeneration(data, deps = {}) {
  const resolveFn = deps.resolveFn || defaultResolve
  const { jobId, type, tier, payload, workspaceId, createdBy } = data
  const { provider, adapter } = resolveFn(type, tier)

  await Job.findByIdAndUpdate(jobId, { status: 'active' })
  try {
    const result = await adapter.generate(payload)
    const resultText = typeof result === 'string' ? result : JSON.stringify(result)
    await Job.findByIdAndUpdate(jobId, { status: 'done', resultText, errorMessage: null })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_text', provider, success: true })
    return { ok: true }
  } catch (err) {
    const msg = (err?.message || 'generation failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_text', provider, success: false, errorMessage: msg })
    throw err
  }
}
