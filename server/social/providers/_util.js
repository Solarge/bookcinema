/**
 * Shared helpers for social provider adapters.
 * Keeps each adapter lean — common fetch wrappers, URL building, and byte download live here.
 */

/**
 * POST a URL-encoded form body and return the parsed JSON response.
 * Throws if the response is not 2xx, including the body in the message.
 *
 * @param {string} url
 * @param {Record<string,string>} params
 * @param {RequestInit} [extra]  — additional fetch options (headers, etc.)
 * @returns {Promise<Record<string,unknown>>}
 */
export async function postForm(url, params, extra = {}) {
  const body = new URLSearchParams(params).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(extra.headers ?? {}),
    },
    body,
    ...extra,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  if (!res.ok) {
    throw new Error(`${url} → ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

/**
 * GET (or any method) a JSON endpoint with an Authorization: Bearer token.
 * Throws if the response is not 2xx.
 *
 * @param {string} url
 * @param {string} accessToken
 * @param {RequestInit} [extra]
 * @returns {Promise<Record<string,unknown>>}
 */
export async function fetchJson(url, accessToken, extra = {}) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(extra.headers ?? {}),
    },
    ...extra,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  if (!res.ok) {
    throw new Error(`${url} → ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

/**
 * Download bytes from a publicly-accessible URL (e.g. an S3 URL).
 * Returns { buffer: Buffer, contentType: string, contentLength: number }.
 *
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, contentType: string, contentLength: number }>}
 */
export async function downloadBytes(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`downloadBytes: failed to fetch ${url} → ${res.status}`)
  }
  const ab = await res.arrayBuffer()
  const buffer = Buffer.from(ab)
  return {
    buffer,
    contentType:   res.headers.get('content-type')   ?? 'video/mp4',
    contentLength: parseInt(res.headers.get('content-length') ?? String(buffer.length), 10),
  }
}

/**
 * Build a query string from an object, encoding all values.
 * Returns a string WITHOUT a leading '?'.
 *
 * @param {Record<string,string|number|boolean>} params
 * @returns {string}
 */
export function qs(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/**
 * Calculate an expiry Date from a response's expires_in (seconds from now).
 *
 * @param {number|string} expiresIn  — seconds
 * @returns {Date}
 */
export function expiresAt(expiresIn) {
  return new Date(Date.now() + Number(expiresIn) * 1000)
}
