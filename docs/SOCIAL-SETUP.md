# Social Auto-Posting — Operator Setup Guide

BookFilm Studio can auto-post finished videos to YouTube, TikTok, Instagram,
Facebook, X, and LinkedIn. The backend (`server/social/**`) is fully built, but
**no platform works until an admin registers a developer app and sets the
corresponding environment variables** on the server.

In the UI (Distribution panel), platforms with credentials show a **Connect**
button; platforms without credentials show **"Not set up yet"**. This guide
explains how to make a platform live.

> **Plan gate:** The `social` feature is only available on the **pro** and
> **studio** plans (`server/plans.js`). On lower plans the panel shows an
> upgrade wall and `GET /:platform/connect` returns `403 { code: 'plan_feature' }`.

---

## How configuration is detected

Each provider module (`server/social/providers/<platform>.js`) exports
`isConfigured()`, which reads `process.env` **live** at call time. A platform is
considered configured only when **both** its client id and client secret env
vars are present and non-empty.

- `GET /api/social/providers` → returns every platform as `{ key, label, configured }`.
- `GET /api/social/<platform>/connect` → returns `503 { code: 'not_configured' }`
  when that platform's `isConfigured()` is `false`.

No server restart trick is needed for `isConfigured()` itself, but set env vars
the normal way (`.env.server` / your process manager) and restart the API so the
values are loaded into `process.env`.

---

## Global environment variables (required for ALL platforms)

| Env var               | Purpose |
|-----------------------|---------|
| `SOCIAL_TOKEN_KEY`    | Secret used to derive an AES-256-GCM key (SHA-256 of the value) that encrypts OAuth access/refresh tokens at rest. Source: `server/utils/cryptoTokens.js`. **Required** — token encrypt/decrypt throws `SOCIAL_TOKEN_KEY not configured` without it. Use a long random string; rotating it invalidates all stored tokens. |
| `SOCIAL_REDIRECT_BASE`| Public base URL the OAuth providers redirect back to, e.g. `https://app.example.com`. The callback URL is built as `${SOCIAL_REDIRECT_BASE}/api/social/<platform>/callback` (`server/routes/social.js → buildRedirectUri`). **In dev/CI** this is optional — when unset it is derived from the incoming request as `${req.protocol}://${req.get('host')}`. In production, set it explicitly so it matches what you register with each provider. |

**The OAuth redirect/callback URI you register with every provider below is:**

```
${SOCIAL_REDIRECT_BASE}/api/social/<platform>/callback
```

e.g. for YouTube in production: `https://app.example.com/api/social/youtube/callback`.
The `<platform>` segment is one of: `youtube`, `tiktok`, `instagram`, `facebook`, `x`, `linkedin`.

---

## Per-platform setup

### YouTube
- **Developer app:** Google Cloud Console → create an OAuth 2.0 Client ID (Web
  application), enable the **YouTube Data API v3**.
- **Env vars:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/youtube/callback`
- **Scopes requested:** `youtube.upload`, `youtube.readonly`
- **Reality check:** Apps in "Testing" mode only work for explicitly added test
  users. To publish for real users you must complete **Google OAuth verification
  / app review** (the `youtube.upload` scope is sensitive). Until verified,
  uploads only work for the app's test users.

### TikTok
- **Developer app:** TikTok for Developers → create an app, add the **Login Kit**
  and **Content Posting API** products.
- **Env vars:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/tiktok/callback`
- **Scopes requested:** `user.info.basic`, `video.upload`, `video.publish`
- **Reality check:** The **Content Posting API requires app review/approval**.
  Until your app is approved for direct posting, publishing only works for the
  app's sandbox/test users and content may be forced to private.

### Instagram
- **Developer app:** Meta for Developers → create an app, add **Instagram Graph
  API** / Facebook Login. Shares the same app credentials as Facebook.
- **Env vars:** `META_APP_ID`, `META_APP_SECRET` *(shared with Facebook)*
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/instagram/callback`
- **Scopes requested:** `instagram_basic`, `instagram_content_publish`,
  `pages_show_list`, `pages_read_engagement`
- **Reality check:** Requires an **Instagram Business/Creator account linked to a
  Facebook Page**. The `instagram_content_publish` permission requires **Meta App
  Review + Business Verification**. Until approved, posting only works for users
  with a role on the app (admin/developer/tester).

### Facebook
- **Developer app:** Meta for Developers → same app as Instagram, add **Facebook
  Login** and Pages products.
- **Env vars:** `META_APP_ID`, `META_APP_SECRET` *(shared with Instagram)*
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/facebook/callback`
- **Scopes requested:** `pages_manage_posts`, `pages_read_engagement`,
  `pages_show_list`
- **Reality check:** Posting to Pages requires `pages_manage_posts`, which needs
  **App Review + Business Verification**. Until approved, posting only works for
  app roles (admin/developer/tester) on Pages they manage.

### X (Twitter)
- **Developer app:** X Developer Portal → create a project + app, enable **OAuth
  2.0** (User authentication, type = Web App / confidential client). Video upload
  needs an **Elevated / Pro** API access tier.
- **Env vars:** `X_CLIENT_ID`, `X_CLIENT_SECRET`
  *(the code also accepts the legacy names `TWITTER_CLIENT_ID` /
  `TWITTER_CLIENT_SECRET` — see `clientId()`/`clientSecret()` in `x.js`)*
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/x/callback`
- **Scopes requested:** `tweet.read`, `tweet.write`, `users.read`,
  `offline.access`, `media.write`
- **Reality check:** `media.write` / video upload requires a **paid (Elevated or
  Pro) access tier**. The Free tier cannot upload video. No business
  verification, but the right API plan is mandatory.

### LinkedIn
- **Developer app:** LinkedIn Developers → create an app associated with a
  Company Page, request the **Sign In with LinkedIn using OpenID Connect**,
  **Share on LinkedIn**, and **Video APIs** products.
- **Env vars:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **Redirect URI:** `${SOCIAL_REDIRECT_BASE}/api/social/linkedin/callback`
- **Scopes requested:** `openid`, `profile`, `w_member_social`, `r_basicprofile`
- **Reality check:** Video posting requires the **Video APIs** product to be
  granted to your app (subject to LinkedIn approval). Refresh tokens are only
  issued if your app has the **Refresh Token grant** enabled.

---

## Quick reference — env vars

```
# Global (required for any platform)
SOCIAL_TOKEN_KEY=<long-random-string>
SOCIAL_REDIRECT_BASE=https://app.example.com   # optional in dev (derived from request)

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# Instagram + Facebook (shared Meta app)
META_APP_ID=
META_APP_SECRET=

# X (legacy TWITTER_* names also accepted)
X_CLIENT_ID=
X_CLIENT_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

---

## How to verify it works

1. **Env loaded:** set the platform's id/secret + `SOCIAL_TOKEN_KEY`, restart the
   API server.
2. **Listing:** call `GET /api/social/providers` (authenticated). The platform
   you configured should show `"configured": true`.
3. **UI:** open the Distribution panel on a **pro/studio** workspace. The platform
   should now show a **Connect** button instead of "Not set up yet".
4. **OAuth round-trip:** click **Connect**. You should be redirected to the
   provider's consent screen, then back to `…/api/social/<platform>/callback`,
   and finally to the app with `?social=connected&platform=<platform>`. The
   account then appears under **Connected Accounts**.
5. **Redirect URI match:** if the provider rejects the redirect, confirm the URI
   registered in the developer console exactly matches
   `${SOCIAL_REDIRECT_BASE}/api/social/<platform>/callback`.
6. **Posting:** schedule a post against the connected platform. Note that for
   YouTube, TikTok, Instagram, and Facebook, **real publishing only succeeds once
   the app has passed review/verification** — before that, it works only for the
   app's test users.
