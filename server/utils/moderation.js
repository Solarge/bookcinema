/**
 * server/utils/moderation.js
 *
 * Server-side content moderation for managed generation.
 *
 * Design:
 *  1. HIGH-SEVERITY REGEX BACKSTOP (always runs, synchronous) — ported from
 *     src/utils/contentSafety.js BLOCKED_PATTERNS. Catches the worst categories
 *     (CSAM, illegal weapons instructions) regardless of API availability.
 *  2. OPENAI MODERATION API (async, runs if OPENAI_API_KEY is set) — calls
 *     omni-moderation-latest with a 10 s timeout. If any category is flagged,
 *     returns flagged:true with the top category as reason.
 *  3. FAIL-SOFT: if the OpenAI call errors OR times out (e.g. 429, network error,
 *     timeout), we do NOT hard-fail the request — we fall back to the regex result.
 *     This ensures a moderation-API outage never blocks all generation, while the
 *     regex backstop still rejects the most dangerous content unconditionally.
 *
 * Usage:
 *   import { moderateText } from '../utils/moderation.js'
 *   const { flagged, reason } = await moderateText(someText)
 *   if (flagged) return res.status(422).json({ error: '...', code: 'content_blocked' })
 */

import { config } from '../config.js'

// ── High-severity regex backstop ──────────────────────────────────────────────
// Ported from src/utils/contentSafety.js BLOCKED_PATTERNS.
// Always applied regardless of whether the OpenAI moderation API is available.
// These cover CSAM, illegal weapons instructions, and equivalent criminal-risk content.
const HIGH_SEVERITY_PATTERNS = [
  { re: /child\s*(abuse|exploitation|pornograph)/i,         reason: 'csam' },
  { re: /child\s*sexual/i,                                   reason: 'csam' },
  { re: /csam/i,                                             reason: 'csam' },
  { re: /loli(con)?/i,                                       reason: 'csam' },
  { re: /shota(con)?/i,                                      reason: 'csam' },
  { re: /non[\s-]?con(sensual)?\s*(sex|rape)/i,             reason: 'illegal/non-consensual' },
  { re: /snuff\s*(film|porn)/i,                              reason: 'illegal/snuff' },
  { re: /gore\s*porn/i,                                      reason: 'violence/gore' },
  { re: /terrorist\s*(manifesto|bomb|attack\s*plan)/i,      reason: 'terrorism' },
  { re: /how\s*to\s*(make|build)\s*(a\s*)?(bomb|weapon\s*of\s*mass)/i, reason: 'weapons' },
]

function checkRegexBackstop(text) {
  for (const { re, reason } of HIGH_SEVERITY_PATTERNS) {
    if (re.test(text)) return { flagged: true, reason }
  }
  return { flagged: false }
}

// ── OpenAI Moderation API call ─────────────────────────────────────────────────
async function callOpenAIModeration(text) {
  const apiKey = config.providerKeys.openai
  if (!apiKey) return null // not configured → caller falls back to regex

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const resp = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      // 429 rate-limit, 5xx, etc. — treat as unavailable, fall back to regex
      return null
    }

    const data = await resp.json()
    const result = data?.results?.[0]
    if (!result) return null

    if (result.flagged) {
      // Find the top-scoring flagged category for the reason string
      const categories = result.categories || {}
      const scores = result.category_scores || {}
      const topCategory = Object.keys(categories)
        .filter(k => categories[k])
        .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))[0] || 'policy_violation'
      return { flagged: true, reason: topCategory }
    }

    return { flagged: false }
  } catch (_err) {
    clearTimeout(timeoutId)
    // Network error, timeout (AbortError), JSON parse error, etc.
    // Fail-soft: return null so caller falls back to regex backstop.
    return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Moderate a text string.
 *
 * Always runs the regex backstop first.
 * If OPENAI_API_KEY is configured, also calls the OpenAI Moderation API and
 * combines results (either flagged → overall flagged).
 * On OpenAI API error/timeout → fail-soft to regex result only (never hard-fail).
 *
 * @param {string} text
 * @returns {Promise<{ flagged: boolean, reason?: string }>}
 */
export async function moderateText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { flagged: false }
  }

  // 1. Regex backstop — always runs (synchronous, no network dependency)
  const regexResult = checkRegexBackstop(text)
  if (regexResult.flagged) {
    // Skip the API call — we already know it's blocked
    return regexResult
  }

  // 2. OpenAI Moderation API — fail-soft: null return means unavailable/error
  const apiResult = await callOpenAIModeration(text)
  if (apiResult !== null) {
    // API responded successfully — trust it
    return apiResult
  }

  // 3. API unavailable / errored → fall back to regex result (which was clean here)
  // Comment: This is intentional fail-soft behaviour. A moderation-API outage
  // (429, timeout, network error) must NOT block all generation — the regex
  // backstop still catches the highest-risk content unconditionally.
  return regexResult
}
