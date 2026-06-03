/**
 * Social distribution routes.
 *
 * Provider injection: req.app.locals.socialProviders (for tests) is a
 * registry-like object with { getProvider(key), listConfigured() }.
 * Falls back to the real server/social/index.js registry.
 */
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import SocialAccount from '../models/SocialAccount.js'
import { encryptToken, decryptToken } from '../utils/cryptoTokens.js'
import { config } from '../config.js'
import { getProvider, listConfigured } from '../social/index.js'

export const socialRouter = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the provider registry to use — injected fake or real. */
function registryFor(req) {
  return req.app.locals.socialProviders || { getProvider, listConfigured }
}

/** Sign a short-lived state JWT for CSRF-safe OAuth round-trips. */
function signState(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' })
}

/** Verify and decode a state JWT. Throws on bad/expired tokens. */
function verifyState(token) {
  return jwt.verify(token, config.jwtSecret)
}

/**
 * Build the OAuth callback URL that the platform will redirect back to.
 * Uses SOCIAL_REDIRECT_BASE when set (production), otherwise derives it from
 * the incoming request (dev / CI).
 */
function buildRedirectUri(req, platform) {
  const base = process.env.SOCIAL_REDIRECT_BASE
    || `${req.protocol}://${req.get('host')}`
  return `${base}/api/social/${platform}/callback`
}

// ---------------------------------------------------------------------------
// GET /api/social/providers  (requireAuth)
// ---------------------------------------------------------------------------
socialRouter.get('/providers', requireAuth, (req, res) => {
  try {
    const registry = registryFor(req)
    res.json(registry.listConfigured())
  } catch (err) {
    console.error('social/providers error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/social/:platform/connect  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.get('/:platform/connect', requireAuth, resolveWorkspace, (req, res) => {
  try {
    const { platform } = req.params
    const registry = registryFor(req)

    let provider
    try {
      provider = registry.getProvider(platform)
    } catch (_) {
      return res.status(400).json({ error: `Unknown platform: ${platform}` })
    }

    if (!provider.isConfigured()) {
      const label = provider.meta?.label || platform
      return res.status(503).json({ error: `${label} not configured`, code: 'not_configured' })
    }

    const state = signState({
      workspaceId: req.workspace._id.toString(),
      platform,
      userId:      req.user._id.toString(),
      purpose:     'social_oauth',
    })

    const redirectUri = buildRedirectUri(req, platform)
    const url = provider.getAuthUrl({ redirectUri, state })
    res.json({ url })
  } catch (err) {
    console.error('social/connect error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/social/:platform/callback  (NO requireAuth — state is the CSRF token)
// ---------------------------------------------------------------------------
socialRouter.get('/:platform/callback', async (req, res) => {
  const { platform } = req.params
  const { code, state: stateToken } = req.query

  // 1. Verify the state JWT
  let statePayload
  try {
    statePayload = verifyState(stateToken)
  } catch (_) {
    return res.status(400).json({ error: 'Invalid or expired state token' })
  }

  if (statePayload.purpose !== 'social_oauth') {
    return res.status(400).json({ error: 'Invalid state purpose' })
  }
  if (statePayload.platform !== platform) {
    return res.status(400).json({ error: 'State/platform mismatch' })
  }

  const { workspaceId, userId } = statePayload
  const registry = registryFor(req)

  let provider
  try {
    provider = registry.getProvider(platform)
  } catch (_) {
    return res.status(400).json({ error: `Unknown platform: ${platform}` })
  }

  // 2. Exchange the authorization code
  let exchanged
  try {
    const redirectUri = buildRedirectUri(req, platform)
    exchanged = await provider.exchangeCode({ code, redirectUri })
  } catch (err) {
    console.error(`social/${platform}/callback exchangeCode error:`, err)
    return res.status(502).json({ error: 'Failed to exchange code with provider' })
  }

  const { account: acctInfo, tokens } = exchanged

  // 3. Encrypt tokens and upsert the SocialAccount
  try {
    const accessTokenEnc  = encryptToken(tokens.accessToken)
    const refreshTokenEnc = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null

    await SocialAccount.findOneAndUpdate(
      { workspaceId, platform, externalId: acctInfo.externalId },
      {
        $set: {
          displayName:     acctInfo.displayName || '',
          accessTokenEnc,
          refreshTokenEnc,
          expiresAt:       tokens.expiresAt || null,
          scopes:          acctInfo.scopes || [],
          connectedBy:     userId,
        },
      },
      { upsert: true, new: true },
    )
  } catch (err) {
    console.error(`social/${platform}/callback upsert error:`, err)
    return res.status(500).json({ error: 'Failed to save account' })
  }

  // 4. Redirect back to the client app
  return res.redirect(302, `${config.clientUrl}/?social=connected&platform=${platform}`)
})

// ---------------------------------------------------------------------------
// GET /api/social/accounts  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.get('/accounts', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ workspaceId: req.workspace._id })
    res.json(accounts.map(a => a.toClient()))
  } catch (err) {
    console.error('social/accounts error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/social/accounts/:id  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.delete('/accounts/:id', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const deleted = await SocialAccount.findOneAndDelete({
      _id:         req.params.id,
      workspaceId: req.workspace._id,
    })
    if (!deleted) return res.status(404).json({ error: 'Account not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('social/accounts delete error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})
