import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

export function signAccess(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry })
}

// Longer-lived token for email links (verification, etc.) — verified with verifyAccess.
export function signEmailToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, config.jwtSecret, { expiresIn })
}

export function signRefresh(payload) {
  // Always embed a unique jti so individual tokens can be blacklisted on logout
  // and rotated on refresh without invalidating all sessions for the user.
  const jti = payload.jti || randomUUID()
  return jwt.sign({ ...payload, jti }, config.jwtRefreshSecret, { expiresIn: config.refreshExpiry })
}

export function verifyAccess(token) {
  return jwt.verify(token, config.jwtSecret)
}

export function verifyRefresh(token) {
  return jwt.verify(token, config.jwtRefreshSecret)
}

export function decodePayload(userId, email, role) {
  return { userId, email, role }
}
