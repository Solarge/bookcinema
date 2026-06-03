import mongoose from 'mongoose'

const PLATFORMS = ['youtube', 'tiktok', 'meta', 'twitter', 'linkedin']

const TARGET_STATUSES = ['pending', 'posting', 'posted', 'failed', 'skipped']

const POST_STATUSES = ['scheduled', 'processing', 'completed', 'partial', 'failed', 'canceled']

const targetSchema = new mongoose.Schema({
  platform: {
    type:     String,
    enum:     PLATFORMS,
    required: true,
  },
  socialAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'SocialAccount',
  },
  status: {
    type:    String,
    enum:    TARGET_STATUSES,
    default: 'pending',
  },
  // Filled in after successful publish
  externalId: { type: String, default: null },
  postUrl:    { type: String, default: null },
  error:      { type: String, default: null },
}, { _id: false })

const scheduledPostSchema = new mongoose.Schema({
  workspaceId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Workspace',
    required: true,
    index:    true,
  },
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  videoUrl: {
    type:     String,
    required: true,
  },
  title: {
    type:    String,
    default: '',
  },
  caption: {
    type:    String,
    default: '',
  },
  // Optional per-platform caption overrides { youtube: '...', tiktok: '...' }
  perPlatformCaption: {
    type:    mongoose.Schema.Types.Mixed,
    default: {},
  },
  targets: [targetSchema],
  scheduledAt: {
    type:     Date,
    required: true,
    index:    true,
  },
  status: {
    type:    String,
    enum:    POST_STATUSES,
    default: 'scheduled',
  },
  // BullMQ job ID for cancellation
  jobId: {
    type:    String,
    default: null,
  },
}, { timestamps: true })

export default mongoose.model('ScheduledPost', scheduledPostSchema)
