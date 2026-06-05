import dotenv from 'dotenv'
dotenv.config({ path: '.env.server' })

const required = (key) => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const config = {
  port:         process.env.PORT || 3001,
  nodeEnv:      process.env.NODE_ENV || 'development',
  mongoUri:     required('MONGODB_URI'),
  jwtSecret:    required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiry:    process.env.JWT_EXPIRY        || '15m',
  refreshExpiry:process.env.REFRESH_EXPIRY    || '7d',
  clientUrl:    process.env.CLIENT_URL        || 'http://localhost:5173',
  adminUrl:     process.env.ADMIN_URL         || '',
  cookieDomain: process.env.COOKIE_DOMAIN     || '',

  aws: {
    region:          required('AWS_REGION'),
    accessKeyId:     required('AWS_ACCESS_KEY_ID'),
    secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
    bucketName:      required('AWS_S3_BUCKET'),
  },

  smtp: {
    host:     process.env.SMTP_HOST || '',
    port:     Number(process.env.SMTP_PORT) || 587,
    user:     process.env.SMTP_USER || '',
    pass:     process.env.SMTP_PASS || '',
    from:     process.env.SMTP_FROM || 'noreply@bookfilm.studio',
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || null,
    from:         process.env.EMAIL_FROM      || process.env.SMTP_FROM || 'noreply@bookfilm.studio',
    fromName:     process.env.EMAIL_FROM_NAME || 'BookFilm Studio',
  },

  redis: {
    // Upstash:  rediss://default:<token>@<host>.upstash.io:6380
    // Local:    redis://:password@localhost:6379
    url: process.env.REDIS_URL || null,
  },

  // Managed-generation provider keys (platform-held). Missing keys disable only
  // the affected tier — they do NOT block server boot (unlike the required() vars).
  providerKeys: {
    groq:       process.env.GROQ_API_KEY        || null,
    anthropic:  process.env.ANTHROPIC_API_KEY   || null,
    gemini:     process.env.GEMINI_API_KEY      || null,
    replicate:  process.env.REPLICATE_API_TOKEN || null,
    falai:      process.env.FALAI_KEY           || null,
    openai:     process.env.OPENAI_API_KEY      || null,
    elevenlabs: process.env.ELEVENLABS_KEY      || null,
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
  },

  // Social distribution — all optional, no throw on missing.
  // Platforms "light up" when clientId + clientSecret are present.
  social: {
    tokenKey:     process.env.SOCIAL_TOKEN_KEY      || '',
    redirectBase: process.env.SOCIAL_REDIRECT_BASE  || process.env.CLIENT_URL || 'http://localhost:5173',
    platforms: {
      youtube: {
        clientId:     process.env.YOUTUBE_CLIENT_ID     || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
      },
      tiktok: {
        clientId:     process.env.TIKTOK_CLIENT_KEY    || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
      },
      instagram: {
        clientId:     process.env.META_APP_ID     || '',
        clientSecret: process.env.META_APP_SECRET || '',
      },
      facebook: {
        clientId:     process.env.META_APP_ID     || '',
        clientSecret: process.env.META_APP_SECRET || '',
      },
      x: {
        clientId:     process.env.X_CLIENT_ID     || process.env.TWITTER_CLIENT_ID     || '',
        clientSecret: process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || '',
      },
      linkedin: {
        clientId:     process.env.LINKEDIN_CLIENT_ID     || '',
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      },
    },
  },

  managed: {
    enabled:          process.env.MANAGED_GENERATION_ENABLED !== 'false', // default ON
    maxConcurrent:    Number(process.env.MANAGED_MAX_CONCURRENT) || 3,
    starterCredits:   Number(process.env.MANAGED_STARTER_CREDITS) || 25,
    // Platform-wide daily spend cap in USD. 0 = disabled (default).
    // When set, the middleware sums today's Job.costUsd across ALL workspaces and
    // blocks new generation if adding estCostFor(type,tier) would exceed this cap.
    dailySpendCapUsd: Number(process.env.MANAGED_DAILY_SPEND_CAP_USD) || 0,
    // Maximum length of bookText accepted by /api/generate/text (characters).
    // Default sized to fit a FULL-LENGTH book so generation covers the entire work
    // (a novel is ~0.5–1M chars). Operators can LOWER this via MANAGED_MAX_BOOKTEXT_CHARS
    // (e.g. to enforce a copyright excerpt) or raise it. Note: very large inputs need a
    // large-context provider (e.g. Gemini); the failover chain should route accordingly.
    maxBookTextChars: Number(process.env.MANAGED_MAX_BOOKTEXT_CHARS) || 2_000_000,
    caps: {
      text:  Number(process.env.MANAGED_CAP_TEXT_DAILY)  || 20,
      image: Number(process.env.MANAGED_CAP_IMAGE_DAILY) || 50,
      voice: Number(process.env.MANAGED_CAP_VOICE_DAILY) || 100,
      video: Number(process.env.MANAGED_CAP_VIDEO_DAILY) || 10,
    },
  },

  stripe: {
    secretKey:      process.env.STRIPE_SECRET_KEY      || '',
    webhookSecret:  process.env.STRIPE_WEBHOOK_SECRET  || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    prices: {
      pro:         process.env.STRIPE_PRICE_PRO         || '',
      studio:      process.env.STRIPE_PRICE_STUDIO      || '',
      pack_small:  process.env.STRIPE_PRICE_PACK_SMALL  || '',
      pack_medium: process.env.STRIPE_PRICE_PACK_MEDIUM || '',
      pack_large:  process.env.STRIPE_PRICE_PACK_LARGE  || '',
    },
    packCredits: { pack_small: 100, pack_medium: 500, pack_large: 2000 },
  },
}

// Production boot warnings — missing keys that are not hard-required but critical at scale.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  [BILLING] STRIPE_SECRET_KEY is not set — billing features are disabled in production!')
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️  [BILLING] STRIPE_WEBHOOK_SECRET is not set — webhook signature verification is disabled in production!')
  }
  if (!process.env.SOCIAL_TOKEN_KEY) {
    console.warn('⚠️  [SOCIAL] SOCIAL_TOKEN_KEY is not set — social OAuth token encryption is insecure in production!')
  }
}
