// Best-of-N ensemble generation — the BookFilm Engine "quality guarantee".
//
// Instead of shipping the first provider that succeeds (failover), this generates
// candidates from up to N usable providers, scores each MEDIA candidate, and returns
// the highest-scoring one. The result is therefore >= the best available provider.
//
// This module is ONLY invoked when config.engine.bestOfN > 1 AND the job is media
// (see worker/processGeneration.js). With the default bestOfN=1 it is never reached,
// so current first-success failover behavior is 100% unchanged.

import { scoreCandidate } from './scoring.js'

/**
 * Generate candidates from multiple providers and return the best one.
 *
 * Provider-selection rules mirror processGeneration's failover loop exactly:
 *   - skip providers whose adapter.isConfigured() returns false (not available here)
 *   - skip freeOnly providers for paid-plan workspaces (commercial ToS safety)
 * Per-provider generate() errors are caught and that provider is skipped.
 *
 * @param {object}   args
 * @param {Array}    args.providers   ordered provider entries: { provider, adapter, model, freeOnly? }
 * @param {object}   args.payload     the generation payload (spread into adapter.generate)
 * @param {string}   args.type        generation type (media types here; 'text' returns first success)
 * @param {number}   args.n           max number of providers to try as candidates
 * @param {Function} [args.scoreFn]   scorer: ({ type, buffer, mimeType, prompt, characterRef }) => Promise<number>
 * @param {boolean}  args.isPaidPlan  whether the workspace is on a paid plan (pro/studio)
 * @returns {Promise<{ result: any, provider: string }>} the winning candidate + the provider that produced it.
 * @throws the last provider error when zero candidates were produced (caller handles like today).
 */
export async function generateBestOfN({ providers, payload, type, n, scoreFn = scoreCandidate, isPaidPlan }) {
  const usable = []
  for (const p of providers || []) {
    if (typeof p.adapter?.isConfigured === 'function' && !p.adapter.isConfigured()) continue
    if (p.freeOnly && isPaidPlan) continue
    usable.push(p)
    if (usable.length >= n) break
  }

  // Generate candidates (catch per-provider errors → skip, remember the last one).
  const candidates = []
  let lastError
  for (const p of usable) {
    try {
      const result = await p.adapter.generate({ ...payload, model: p.model })
      candidates.push({ result, provider: p.provider })
    } catch (e) {
      lastError = e
      console.warn(`[engine] best-of-N candidate failed: ${type} → ${p.provider} failed: ${e.message}`)
    }
  }

  // Zero candidates → behave like the failover loop: throw the last error.
  if (candidates.length === 0) {
    throw lastError || new Error(`No configured provider available for ${type}`)
  }
  // Single candidate → no scoring needed.
  if (candidates.length === 1) return candidates[0]

  // Text is not scored here — just take the first success (text has no buffer to score).
  if (type === 'text') return candidates[0]

  // Score every MEDIA candidate and return the highest. Ties → first (stable: '>' only).
  let best = candidates[0]
  let bestScore = -Infinity
  for (const c of candidates) {
    let score
    try {
      score = await scoreFn({
        type,
        buffer: c.result?.buffer,
        mimeType: c.result?.mimeType,
        prompt: payload?.prompt,
        characterRef: payload?.characterRef,
      })
    } catch {
      score = 0.5 // neutral on scorer failure — never let a bad scorer drop a candidate
    }
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}
