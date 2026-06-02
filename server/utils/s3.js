import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { config } from '../config.js'

export const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId:     config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
})

export async function uploadBuffer(key, buffer, mimeType) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket:      config.aws.bucketName,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
    },
  })
  await upload.done()
  return `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`
}

export async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: config.aws.bucketName, Key: key }))
}

export async function getPresignedUrl(key, expiresIn = 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.aws.bucketName, Key: key }), { expiresIn })
}

export function assetKey(userId, seriesId, type, filename) {
  return `assets/${userId}/${seriesId}/${type}/${filename}`
}
