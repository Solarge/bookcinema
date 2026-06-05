import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import Workspace from '../models/Workspace.js'
import { resolve as defaultResolve } from '../generation/resolve.js'
import { uploadBuffer as defaultUpload } from '../utils/s3.js'
import { sendEmail, jobCompleteEmail } from '../utils/email.js'
import { config } from '../config.js'

// Job types that warrant a "your generation is ready" email (slower jobs only)
const NOTIFY_TYPES = new Set(['video', 'compile'])

export async function processGeneration(data, deps = {}) {
  const resolveFn = deps.resolveFn || defaultResolve
  const uploadFn = deps.uploadFn || defaultUpload
  const { jobId, type, tier, payload, workspaceId, createdBy } = data
  await Job.findByIdAndUpdate(jobId, { status: 'active' })
  let provider = ''
  try {
    const entry = resolveFn(type, tier)

    // --- plan-aware free-first failover loop ---
    // Fetch the workspace plan once per job so we can skip freeOnly providers
    // for paid-plan (pro/studio) workspaces.
    // Rationale: free-tier API accounts (Groq free, Gemini free, etc.) prohibit
    // commercial use. Paid customers must not inadvertently run on these keys.
    // To flag a provider as free-tier: set freeOnly:true on its registry entry.
    // Default: no entries flagged → no behavior change.
    const ws = await Workspace.findById(workspaceId).select('plan').lean()
    const isPaidPlan = ws && (ws.plan === 'pro' || ws.plan === 'studio')

    // entry.providers is the ordered list; entry.adapter/.provider for legacy injected fakes.
    const providers = entry.providers || [{ provider: entry.provider, adapter: entry.adapter, model: entry.model }]
    let result
    let lastError
    for (const p of providers) {
      // Skip providers whose key isn't configured (not a failure — just not available here)
      if (typeof p.adapter.isConfigured === 'function' && !p.adapter.isConfigured()) continue
      // Skip freeOnly providers for paid-plan workspaces (commercial ToS safety).
      if (p.freeOnly && isPaidPlan) continue
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

    // Job-complete notification for slow job types — best-effort, never block the result
    if (NOTIFY_TYPES.has(type)) {
      try {
        const User = (await import('../models/User.js')).default
        const creator = await User.findById(createdBy)
        if (creator) {
          const resultLink = update.resultUrl || `${config.clientUrl}/`
          await sendEmail({
            to: creator.email,
            subject: `Your ${type} generation is ready — BookFilm Studio`,
            html: jobCompleteEmail(creator.name, type, resultLink),
          })
        }
      } catch (notifyErr) {
        console.warn('[processGeneration] job-complete email failed (non-fatal):', notifyErr.message)
      }
    }

    return { ok: true }
  } catch (err) {
    const msg = (err?.message || 'generation failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_' + type, provider, success: false, errorMessage: msg })
    throw err
  }
}
