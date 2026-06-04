/**
 * Unit tests for server/utils/urlGuard.js
 *
 * Covers:
 *  - https S3 URL passes
 *  - http URL rejected
 *  - AWS IMDS metadata URL rejected
 *  - https://localhost rejected
 *  - https://10.x.x.x rejected
 *  - SOCIAL_VIDEO_ALLOWED_HOSTS allowlist enforcement
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { validateVideoUrl } from '../utils/urlGuard.js'

// Restore env var after each test that may set it
afterEach(() => {
  delete process.env.SOCIAL_VIDEO_ALLOWED_HOSTS
})

// ---------------------------------------------------------------------------
// Passing cases
// ---------------------------------------------------------------------------

test('urlGuard: https S3 URL passes', () => {
  const result = validateVideoUrl('https://mybucket.s3.amazonaws.com/path/to/video.mp4')
  assert.equal(result.ok, true, `expected ok, got: ${result.reason}`)
})

test('urlGuard: generic public https URL passes when no allowlist set', () => {
  const result = validateVideoUrl('https://cdn.example.com/video.mp4')
  assert.equal(result.ok, true, `expected ok, got: ${result.reason}`)
})

// ---------------------------------------------------------------------------
// Rejected cases (no allowlist)
// ---------------------------------------------------------------------------

test('urlGuard: http URL is rejected', () => {
  const result = validateVideoUrl('http://s3.amazonaws.com/bucket/video.mp4')
  assert.equal(result.ok, false)
})

test('urlGuard: https://169.254.169.254/latest/meta-data is rejected', () => {
  const result = validateVideoUrl('https://169.254.169.254/latest/meta-data')
  assert.equal(result.ok, false)
})

test('urlGuard: https://localhost/x is rejected', () => {
  const result = validateVideoUrl('https://localhost/x')
  assert.equal(result.ok, false)
})

test('urlGuard: https://10.1.2.3/x is rejected', () => {
  const result = validateVideoUrl('https://10.1.2.3/x')
  assert.equal(result.ok, false)
})

test('urlGuard: https://127.0.0.1/x is rejected (loopback)', () => {
  const result = validateVideoUrl('https://127.0.0.1/x')
  assert.equal(result.ok, false)
})

test('urlGuard: https://192.168.1.1/x is rejected (private range)', () => {
  const result = validateVideoUrl('https://192.168.1.1/x')
  assert.equal(result.ok, false)
})

test('urlGuard: https://172.20.0.1/x is rejected (172.16/12 private range)', () => {
  const result = validateVideoUrl('https://172.20.0.1/x')
  assert.equal(result.ok, false)
})

test('urlGuard: https://metadata.google.internal/x is rejected', () => {
  const result = validateVideoUrl('https://metadata.google.internal/x')
  assert.equal(result.ok, false)
})

test('urlGuard: non-URL string is rejected', () => {
  const result = validateVideoUrl('not a url')
  assert.equal(result.ok, false)
})

// ---------------------------------------------------------------------------
// Allowlist tests
// ---------------------------------------------------------------------------

test('urlGuard: with SOCIAL_VIDEO_ALLOWED_HOSTS=amazonaws.com, non-amazonaws host is rejected', () => {
  process.env.SOCIAL_VIDEO_ALLOWED_HOSTS = 'amazonaws.com'
  const result = validateVideoUrl('https://cdn.example.com/video.mp4')
  assert.equal(result.ok, false)
})

test('urlGuard: with SOCIAL_VIDEO_ALLOWED_HOSTS=amazonaws.com, amazonaws host passes', () => {
  process.env.SOCIAL_VIDEO_ALLOWED_HOSTS = 'amazonaws.com'
  const result = validateVideoUrl('https://mybucket.s3.amazonaws.com/video.mp4')
  assert.equal(result.ok, true, `expected ok, got: ${result.reason}`)
})

test('urlGuard: with multi-entry allowlist, a matching suffix passes', () => {
  process.env.SOCIAL_VIDEO_ALLOWED_HOSTS = 'amazonaws.com,cloudfront.net'
  const result = validateVideoUrl('https://d1234.cloudfront.net/video.mp4')
  assert.equal(result.ok, true, `expected ok, got: ${result.reason}`)
})

test('urlGuard: allowlist still blocks private IPs even when allowlist is set', () => {
  process.env.SOCIAL_VIDEO_ALLOWED_HOSTS = 'amazonaws.com'
  // A private IP doesn't match amazonaws.com anyway — but the private check fires first
  const result = validateVideoUrl('https://10.0.0.1/x')
  assert.equal(result.ok, false)
})
