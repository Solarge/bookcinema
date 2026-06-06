/**
 * Social distribution routes.
 *
 * Provider injection: req.app.locals.socialProviders (for tests) is a
 * registry-like object with { getProvider(key), listConfigured() }.
 * Falls back to the real server/social/index.js registry.
 *
 * Queue injection: req.app.locals.socialPublishQueue (for tests) is a
 * fake queue with { add(), remove() }.  Falls back to the real BullMQ queue.
 */
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import SocialAccount from '../models/SocialAccount.js'
import ScheduledPost from '../models/ScheduledPost.js'
import { encryptToken, decryptToken } from '../utils/cryptoTokens.js'
import { config } from '../config.js'
import { getProvider, listConfigured, listAll } from '../social/index.js'
import { getSocialPublishQueue } from '../utils/socialQueue.js'
import { validateVideoUrl } from '../utils/urlGuard.js'
import { planFeatureError } from '../middleware/managedAccess.js'
import { planAllows } from '../plans.js'

const VALID_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin']

export const socialRouter = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the provider registry to use — injected fake or real. */
function registryFor(req) {
  return req.app.locals.socialProviders || { getProvider, listConfigured, listAll }
}

/** Returns the social publish queue — injected fake or real BullMQ queue. */
function queueFor(req) {
  return req.app.locals.socialPublishQueue || getSocialPublishQueue()
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
// Returns the FULL platform list — every supported platform with a `configured`
// boolean — so the UI can surface unconfigured platforms (greyed "not set up
// yet") rather than hiding them. Prefers listAll(); falls back to
// listConfigured() for injected fakes that predate listAll().
socialRouter.get('/providers', requireAuth, (req, res) => {
  try {
    const registry = registryFor(req)
    const list = typeof registry.listAll === 'function'
      ? registry.listAll()
      : registry.listConfigured()
    res.json(list)
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
    const plan = req.workspace?.plan || 'free'
    if (!planAllows(plan, 'social')) return planFeatureError(res, 'social')

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

// ---------------------------------------------------------------------------
// POST /api/social/posts  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.post('/posts', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const plan = req.workspace?.plan || 'free'
    if (!planAllows(plan, 'social')) return planFeatureError(res, 'social')

    const { videoUrl, title = '', caption = '', perPlatformCaption, targets, scheduledAt } = req.body

    // Validate required fields
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' })
    }

    // Finding A — SSRF guard: validate videoUrl before any DB work
    const urlCheck = validateVideoUrl(videoUrl)
    if (!urlCheck.ok) {
      return res.status(400).json({ error: 'Invalid video URL', code: 'invalid_video_url' })
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'targets must be a non-empty array of platform keys' })
    }

    // Validate scheduledAt
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'scheduledAt must be a valid date' })
    }
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' })
    }
    // Finding D — cap scheduling horizon to 1 year
    if (scheduledDate.getTime() > Date.now() + 365 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'scheduledAt is too far in the future', code: 'schedule_too_far' })
    }

    // Validate each target platform
    const registry = registryFor(req)
    const invalidTargets = []

    for (const platform of targets) {
      // Unknown platform
      if (!VALID_PLATFORMS.includes(platform)) {
        invalidTargets.push({ platform, reason: 'unknown platform' })
        continue
      }
      // Provider not configured
      let provider
      try {
        provider = registry.getProvider(platform)
      } catch (_) {
        invalidTargets.push({ platform, reason: 'unknown platform' })
        continue
      }
      if (!provider.isConfigured()) {
        invalidTargets.push({ platform, reason: 'provider not configured' })
        continue
      }
      // No connected SocialAccount in this workspace
      const account = await SocialAccount.findOne({ workspaceId: req.workspace._id, platform })
      if (!account) {
        invalidTargets.push({ platform, reason: 'no connected account' })
      }
    }

    if (invalidTargets.length > 0) {
      return res.status(422).json({ error: 'One or more targets are invalid', invalidTargets })
    }

    // Resolve targets to { platform, socialAccountId, status:'pending' }
    const resolvedTargets = []
    for (const platform of targets) {
      const account = await SocialAccount.findOne({ workspaceId: req.workspace._id, platform })
      resolvedTargets.push({ platform, socialAccountId: account._id, status: 'pending' })
    }

    // Create the ScheduledPost
    const post = new ScheduledPost({
      workspaceId:       req.workspace._id,
      createdBy:         req.user._id,
      videoUrl,
      title,
      caption,
      perPlatformCaption: perPlatformCaption || {},
      targets:           resolvedTargets,
      scheduledAt:       scheduledDate,
      status:            'scheduled',
    })

    // Enqueue delayed BullMQ job (injectable via app.locals for tests)
    const queue = queueFor(req)
    const delay = Math.max(0, scheduledDate.getTime() - Date.now())

    if (queue) {
      try {
        const job = await queue.add('social-publish', { postId: post._id.toString() }, {
          delay,
          attempts:         3,
          backoff:          { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail:     100,
        })
        post.jobId = job.id
      } catch (err) {
        // Queue error is non-fatal — post is still created; log for observability
        console.warn('social/posts: failed to enqueue job (queue error):', err.message)
      }
    }
    // If queue is null (no Redis), post is created with status 'scheduled' but
    // no job fires — documented limitation, does not crash.

    await post.save()
    return res.status(202).json(post.toClient())
  } catch (err) {
    console.error('social/posts POST error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/social/posts  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.get('/posts', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const posts = await ScheduledPost
      .find({ workspaceId: req.workspace._id })
      .sort({ createdAt: -1 })
    res.json(posts.map(p => p.toClient()))
  } catch (err) {
    console.error('social/posts GET error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/social/posts/:id  (requireAuth + resolveWorkspace)
// ---------------------------------------------------------------------------
socialRouter.delete('/posts/:id', requireAuth, resolveWorkspace, async (req, res) => {
  try {
    const post = await ScheduledPost.findOne({
      _id:         req.params.id,
      workspaceId: req.workspace._id,
    })
    if (!post) return res.status(404).json({ error: 'Post not found' })

    // Only cancel if not already in a terminal/in-progress state
    if (post.status === 'processing' || post.status === 'completed' || post.status === 'partial') {
      return res.status(409).json({ error: `Cannot cancel a post with status '${post.status}'` })
    }

    // Remove the BullMQ job best-effort
    if (post.jobId) {
      const queue = queueFor(req)
      if (queue) {
        try { await queue.remove(post.jobId) } catch (_) { /* best-effort */ }
      }
    }

    post.status = 'canceled'
    await post.save()
    res.json({ ok: true, post: post.toClient() })
  } catch (err) {
    console.error('social/posts DELETE error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})
