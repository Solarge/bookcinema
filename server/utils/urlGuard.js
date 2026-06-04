/**
 * SSRF guard for user-supplied video URLs.
 *
 * Rules:
 *  1. Must be a parseable URL with the https: protocol.
 *  2. Hostname must not be a private/loopback/link-local/metadata address
 *     (checked by string name and by parsing IPv4 literal octets).
 *  3. If SOCIAL_VIDEO_ALLOWED_HOSTS is set (comma-separated suffix list) the
 *     hostname must end with one of those suffixes; otherwise any public https
 *     host that passed rule 2 is accepted.
 *
 * Exports:
 *   validateVideoUrl(url)  — returns { ok: true } or { ok: false, reason }
 */

/** Blocked hostnames (exact match, lower-cased). */
const BLOCKED_NAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '0.0.0.0',
])

/** Returns true if the string is a private/loopback/link-local IPv4 address. */
function isPrivateIPv4(hostname) {
  // Must look like an IPv4 literal: four decimal octets
  const ipv4Re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const m = hostname.match(ipv4Re)
  if (!m) return false

  const [, a, b, c, d] = m.map(Number)

  // Validate octet range
  if (a > 255 || b > 255 || c > 255 || d > 255) return false

  // 127.0.0.0/8  — loopback
  if (a === 127) return true
  // 10.0.0.0/8   — private
  if (a === 10) return true
  // 172.16.0.0/12 — private (172.16–172.31)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true
  // 169.254.0.0/16 — link-local / AWS IMDS
  if (a === 169 && b === 254) return true
  // 0.0.0.0/8
  if (a === 0) return true

  return false
}

/** Returns true if the hostname looks like a private IPv6 address (::1, fc00::/7). */
function isPrivateIPv6(hostname) {
  const h = hostname.toLowerCase()
  // ::1 — loopback
  if (h === '::1') return true
  // Strip brackets e.g. [::1]
  const stripped = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
  if (stripped === '::1') return true
  // fc00::/7 covers fc00:: – fdff::
  if (/^f[cd]/i.test(stripped)) return true
  return false
}

/**
 * Validates a user-supplied video URL against SSRF rules.
 *
 * @param {string} url
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateVideoUrl(url) {
  if (!url || typeof url !== 'string') {
    return { ok: false, reason: 'URL is required' }
  }

  // 1. Must parse as a URL
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'URL is not valid' }
  }

  // 2. Must use https:
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'URL must use https' }
  }

  const hostname = parsed.hostname.toLowerCase()

  // 3. Blocked names
  if (BLOCKED_NAMES.has(hostname)) {
    return { ok: false, reason: 'URL hostname is not allowed' }
  }

  // 4. Private IPv4 ranges
  if (isPrivateIPv4(hostname)) {
    return { ok: false, reason: 'URL resolves to a private address' }
  }

  // 5. Private IPv6
  if (isPrivateIPv6(hostname)) {
    return { ok: false, reason: 'URL resolves to a private address' }
  }

  // 6. Optional allowlist (SOCIAL_VIDEO_ALLOWED_HOSTS=amazonaws.com,cloudfront.net)
  const allowedHosts = process.env.SOCIAL_VIDEO_ALLOWED_HOSTS
  if (allowedHosts) {
    const suffixes = allowedHosts
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)

    const allowed = suffixes.some(suffix =>
      hostname === suffix || hostname.endsWith('.' + suffix),
    )

    if (!allowed) {
      return { ok: false, reason: `URL hostname is not in the allowed host list` }
    }
  }

  return { ok: true }
}
