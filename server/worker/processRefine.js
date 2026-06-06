import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { resolve as defaultResolve } from '../generation/resolve.js'
import { buildRefinePrompt } from '../generation/refinePrompt.js'
import { config } from '../config.js'

/**
 * processRefine — "Director's Chat" worker.
 *
 * Mirrors processGeneration's structure and free-first failover loop, but calls
 * the text adapter's `complete()` (a single raw LLM call) rather than `generate()`.
 * The model returns a JSON envelope string { mode, answer?, series? } which we
 * store verbatim as resultText (the jobs route surfaces it like a 'text' result).
 * Refund-on-failure is handled in worker/index.js (terminal-only), same as every
 * other job type — this fn only marks the job failed + logs on all-provider-fail.
 */
export async function processRefine(data, deps = {}) {
  const resolveFn = deps.resolveFn || defaultResolve
  const { jobId, tier, payload, workspaceId, createdBy } = data
  await Job.findByIdAndUpdate(jobId, { status: 'active' })
  let provider = ''
  try {
    const entry = resolveFn('refine', tier)
    // entry.providers is the ordered list; entry.adapter/.provider for legacy injected fakes.
    const providers = entry.providers || [{ provider: entry.provider, adapter: entry.adapter, model: entry.model }]

    const system = buildRefinePrompt(payload.language || 'en')
    const user = `CURRENT SERIES JSON:\n${JSON.stringify(payload.currentSeries)}\n\nUSER REQUEST:\n${payload.instruction}`

    let resultText
    let lastError
    for (const p of providers) {
      // Skip providers whose key isn't configured (not a failure — just not available here)
      if (typeof p.adapter.isConfigured === 'function' && !p.adapter.isConfigured()) continue
      try {
        const out = await p.adapter.complete({
          system,
          user,
          model: p.model,
          json: true,
          maxTokens: config.managed.seriesMaxTokens,
        })
        resultText = typeof out === 'string' ? out : JSON.stringify(out)
        provider = p.provider
        break
      } catch (e) {
        lastError = e
        console.warn(`[managed] refine failover: refine/${tier} → ${p.provider} failed: ${e.message}`)
      }
    }
    if (resultText === undefined) {
      throw lastError || new Error(`No configured provider available for refine/${tier}`)
    }

    // Store the model output as-is. If it isn't parseable JSON with a 'mode', the
    // client surfaces a parse error — we intentionally keep this fn simple.
    await Job.findByIdAndUpdate(jobId, { status: 'done', resultText, errorMessage: null })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'refine', provider, success: true })
    return { ok: true }
  } catch (err) {
    const msg = (err?.message || 'refine failed').slice(0, 500)
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'refine', provider, success: false, errorMessage: msg })
    throw err
  }
}
