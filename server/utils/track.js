import AnalyticsEvent from '../models/AnalyticsEvent.js'

/**
 * Best-effort funnel event tracker. Never throws — a tracking failure must never
 * break the calling flow.
 *
 * @param {string} event          - Event name (e.g. 'signup', 'email_verified')
 * @param {{ userId?, workspaceId?, props? }} [opts]
 */
export async function track(event, { userId = null, workspaceId = null, props = {} } = {}) {
  try {
    await AnalyticsEvent.create({ event, userId: userId || null, workspaceId: workspaceId || null, props: props || {} })
  } catch (err) {
    // Best-effort: log but never propagate
    console.warn(`[track] failed to write event "${event}" (non-fatal):`, err.message)
  }
}
