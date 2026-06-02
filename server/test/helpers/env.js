// Set required env vars before any config.js import in tests that need them.
process.env.NODE_ENV ||= 'test'
process.env.JWT_SECRET ||= 'test_jwt_secret_at_least_32_characters_long_x'
process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_at_least_32_characters_x'
process.env.MONGODB_URI ||= 'mongodb://placeholder' // overridden by in-memory connect
process.env.AWS_REGION ||= 'us-east-1'
process.env.AWS_ACCESS_KEY_ID ||= 'test'
process.env.AWS_SECRET_ACCESS_KEY ||= 'test'
process.env.AWS_S3_BUCKET ||= 'test-bucket'
