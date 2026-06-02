import multer from 'multer'
import multerS3 from 'multer-s3'
import { s3, assetKey } from '../utils/s3.js'
import { config } from '../config.js'

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime']
const ALLOWED_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm']
const ALLOWED_ALL   = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO, ...ALLOWED_AUDIO]

function makeS3Upload(folder, allowedTypes, maxMB = 500) {
  return multer({
    storage: multerS3({
      s3,
      bucket: config.aws.bucketName,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext   = file.originalname.split('.').pop()
        const key   = assetKey(req.user._id.toString(), req.params.seriesId || 'misc', folder, `${Date.now()}.${ext}`)
        cb(null, key)
      },
    }),
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) cb(null, true)
      else cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`))
    },
  })
}

export const uploadImage = makeS3Upload('images', ALLOWED_IMAGE, 20)
export const uploadVideo = makeS3Upload('videos', ALLOWED_VIDEO, 500)
export const uploadAudio = makeS3Upload('audio',  ALLOWED_AUDIO, 50)
export const uploadAny   = makeS3Upload('exports', ALLOWED_ALL, 500)
