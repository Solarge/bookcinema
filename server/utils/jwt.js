import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function signAccess(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry })
}

export function signRefresh(payload) {
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.refreshExpiry })
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
