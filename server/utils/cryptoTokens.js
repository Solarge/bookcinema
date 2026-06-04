/**
 * AES-256-GCM token encryption/decryption for OAuth tokens stored at rest.
 *
 * Design note: reads process.env.SOCIAL_TOKEN_KEY directly at call time
 * (not via config snapshot) so tests can set/unset the env var without
 * re-importing the module. Mirrors the pattern used by generation providers
 * (e.g. groqText.js reads process.env.GROQ_API_KEY live).
 */
import crypto from 'node:crypto'

/**
 * Derive a 32-byte key from the SOCIAL_TOKEN_KEY env var using SHA-256.
 * Reads process.env at call time so tests can set/unset it without re-importing.
 * Throws if SOCIAL_TOKEN_KEY is not set.
 */
function getKey() {
  // Read env directly (not via config snapshot) so tests setting the env var
  // after module load still take effect immediately — same pattern as the
  // generation providers (e.g. groqText.js reads process.env.GROQ_API_KEY live).
  const raw = process.env.SOCIAL_TOKEN_KEY
  if (!raw) throw new Error('SOCIAL_TOKEN_KEY not configured')
  return crypto.createHash('sha256').update(raw).digest()
}

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Returns a string in the format: ivHex:tagHex:cipherHex
 */
export function encryptToken(plain) {
  const key = getKey()
  const iv = crypto.randomBytes(12) // 96-bit IV is standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a token previously encrypted with encryptToken().
 * Verifies the GCM authentication tag — tampered input throws.
 * Input format: ivHex:tagHex:cipherHex
 */
export function decryptToken(enc) {
  const key = getKey()
  const parts = enc.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')
  const [ivHex, tagHex, cipherHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
