/**
 * processSocialPublish — worker processor for the 'social-publish' queue.
 *
 * Design mirrors processGeneration.js:
 *  - Exported function takes the document ID (not the full BullMQ Job object)
 *    so it can be called directly in tests without any BullMQ dependency.
 *  - deps.getProvider is injectable so tests can pass fake providers.
 *  - Tokens are decrypted only inside this function and never logged.
 *  - Idempotent: targets already 'posted' are skipped.
 */
import ScheduledPost from '../models/ScheduledPost.js'
import SocialAccount from '../models/SocialAccount.js'
import { decryptToken, encryptToken } from '../utils/cryptoTokens.js'
import { getProvider as defaultGetProvider } from '../social/index.js'

/**
 * Process a scheduled post.
 *
 * @param {string} postId  - ScheduledPost._id
 * @param {{ getProvider?: Function }} deps - injectable for tests
 */
export async function processSocialPublish(postId, { getProvider } = {}) {
  const getProviderFn = getProvider || defaultGetProvider

  // Load the post
  const post = await ScheduledPost.findById(postId)
  if (!post) return          // already deleted
  if (post.status === 'canceled') return  // canceled before the job fired

  // Mark processing
  post.status = 'processing'
  await post.save()

  // Process each target
  for (const target of post.targets) {
    // Idempotent — skip already-posted targets
    if (target.status === 'posted') continue

    // Load the social account
    const account = await SocialAccount.findById(target.socialAccountId)
    if (!account) {
      target.status = 'failed'
      target.error  = 'account disconnected'
      continue
    }

    // Decrypt tokens (never log them)
    let accessToken, refreshToken
    try {
      accessToken  = decryptToken(account.accessTokenEnc)
      refreshToken = account.refreshTokenEnc ? decryptToken(account.refreshTokenEnc) : null
    } catch (err) {
      target.status = 'failed'
      target.error  = 'token decrypt error: ' + err.message
      continue
    }

    // Refresh if expired and a refreshToken is available
    const provider = getProviderFn(target.platform)
    if (account.expiresAt && account.expiresAt < new Date() && refreshToken) {
      try {
        const refreshed = await provider.refresh({ refreshToken })
        // Persist newly encrypted tokens
        account.accessTokenEnc  = encryptToken(refreshed.accessToken)
        if (refreshed.refreshToken) {
          account.refreshTokenEnc = encryptToken(refreshed.refreshToken)
        }
        if (refreshed.expiresAt) {
          account.expiresAt = refreshed.expiresAt
        }
        await account.save()
        accessToken  = refreshed.accessToken
        refreshToken = refreshed.refreshToken || refreshToken
      } catch (err) {
        target.status = 'failed'
        target.error  = 'token refresh error: ' + err.message
        continue
      }
    }

    // Publish
    try {
      const caption = (post.perPlatformCaption && post.perPlatformCaption[target.platform])
        || post.caption
      const result = await provider.publishVideo({
        tokens:   { accessToken, refreshToken },
        videoUrl: post.videoUrl,
        caption,
        title:    post.title,
      })
      target.status     = 'posted'
      target.externalId = result.externalId || null
      target.postUrl    = result.url        || null
      target.error      = null
    } catch (err) {
      target.status = 'failed'
      target.error  = err.message
    }
  }

  // Aggregate post status
  const total  = post.targets.length
  const posted = post.targets.filter(t => t.status === 'posted').length
  const failed = post.targets.filter(t => t.status === 'failed').length

  if (posted === total) {
    post.status = 'completed'
  } else if (posted > 0) {
    post.status = 'partial'
  } else {
    post.status = 'failed'
  }

  await post.save()
}
