import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { resolve as defaultResolve } from '../generation/resolve.js'
import { uploadBuffer as defaultUpload } from '../utils/s3.js'

export async function processGeneration(data, deps = {}) {
  const resolveFn = deps.resolveFn || defaultResolve
  const uploadFn = deps.uploadFn || defaultUpload
  const { jobId, type, tier, payload, workspaceId, createdBy } = data
  await Job.findByIdAndUpdate(jobId, { status: 'active' })
  let provider = ''
  try {
    const entry = resolveFn(type, tier)

    // --- free-first failover loop ---
    // entry.providers is the ordered list; entry.adapter/.provider for legacy injected fakes.
    const providers = entry.providers || [{ provider: entry.provider, adapter: entry.adapter, model: entry.model }]
    let result
    let lastError
    for (const p of providers) {
      // Skip providers whose key isn't configured (not a failure — just not available here)
      if (typeof p.adapter.isConfigured === 'function' && !p.adapter.isConfigured()) continue
      try {
        result = await p.adapter.generate({ ...payload, model: p.model })
        provider = p.provider
        break
      } catch (e) {
        lastError = e
        console.warn(`[managed] provider failover: ${type}/${tier} → ${p.provider} failed: ${e.message}`)
      }
    }
    if (result === undefined) {
      throw lastError || new Error(`No configured provider available for ${type}/${tier}`)
    }
    // --------------------------------

    const update = { status: 'done', errorMessage: null }
    if (type === 'text') {
      update.resultText = typeof result === 'string' ? result : JSON.stringify(result)
    } else {
      const ext = result.ext || 'bin'
      const key = `generated/${workspaceId}/${jobId}.${ext}`
      update.resultUrl = await uploadFn(key, result.buffer, result.mimeType || 'application/octet-stream')
    }
    await Job.findByIdAndUpdate(jobId, update)
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_' + type, provider, success: true })
    return { ok: true }
  } catch (err) {
    const msg = (err?.message || 'generation failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_' + type, provider, success: false, errorMessage: msg })
    throw err
  }
}
