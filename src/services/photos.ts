import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { photoBucketName, photoCdnDomain, photoPresignedUrlExpireSeconds } from '../config'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({}))

export const generatePresignedUploadUrl = async (
  randomUUID = () => crypto.randomUUID(),
): Promise<{ uploadUrl: string; key: string; photoUrl: string }> => {
  const key = `photos/${randomUUID()}`
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: photoBucketName, Key: key }), {
    expiresIn: photoPresignedUrlExpireSeconds,
  })
  return { uploadUrl, key, photoUrl: `https://${photoCdnDomain}/${key}` }
}
