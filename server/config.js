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
    replicate:  process.env.REPLICATE_API_TOKEN || null,
    falai:      process.env.FALAI_KEY           || null,
    openai:     process.env.OPENAI_API_KEY      || null,
    elevenlabs: process.env.ELEVENLABS_KEY      || null,
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
  },

  managed: {
    enabled:        process.env.MANAGED_GENERATION_ENABLED !== 'false', // default ON
    maxConcurrent:  Number(process.env.MANAGED_MAX_CONCURRENT) || 3,
    starterCredits: Number(process.env.MANAGED_STARTER_CREDITS) || 25,
    caps: {
      text:  Number(process.env.MANAGED_CAP_TEXT_DAILY)  || 20,
      image: Number(process.env.MANAGED_CAP_IMAGE_DAILY) || 50,
      voice: Number(process.env.MANAGED_CAP_VOICE_DAILY) || 100,
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
