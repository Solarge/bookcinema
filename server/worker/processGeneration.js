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
    const resolved = resolveFn(type, tier)
    provider = resolved.provider
    const result = await resolved.adapter.generate(payload)

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
