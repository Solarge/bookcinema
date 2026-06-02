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

  redis: {
    // Upstash:  rediss://default:<token>@<host>.upstash.io:6380
    // Local:    redis://:password@localhost:6379
    url: process.env.REDIS_URL || null,
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
  },
}
