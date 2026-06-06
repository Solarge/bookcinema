import mongoose from 'mongoose'

// Canonical REFERENCE portrait per character ("character memory"). One row per
// (seriesId, characterId): the promoted character portrait that downstream
// generation passes to the engine as `characterRef` so the same character looks
// consistent across scenes/episodes. Upserted from a promoted character_image
// Asset (see routes/assets.js from-job). s3Url is stored raw; presign on read.
const characterAssetSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  seriesId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
  characterId: { type: String, required: true },
  name:        { type: String, default: '' },

  // S3 storage — mirrors Asset.js.
  s3Key: { type: String, required: true },
  s3Url: { type: String, required: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

// One canonical reference per character within a series.
characterAssetSchema.index({ seriesId: 1, characterId: 1 }, { unique: true })

export default mongoose.model('CharacterAsset', characterAssetSchema)
