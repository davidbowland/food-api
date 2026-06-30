import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { buildPhotoUrl, generatePresignedUploadUrl } from '@services/photos'

jest.mock('@aws-sdk/client-s3')
jest.mock('@aws-sdk/s3-request-presigner')
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x) }))
jest.mock('@config', () => ({
  photoBucketName: 'test-bucket',
  photoCdnDomain: 'food-photos.example.com',
  photoPresignedUrlExpireSeconds: 3600,
}))

describe('buildPhotoUrl', () => {
  it('constructs CDN URL from fileId', () => {
    expect(buildPhotoUrl('abc-123')).toBe('https://food-photos.example.com/abc-123')
  })
})

describe('generatePresignedUploadUrl', () => {
  beforeAll(() => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/presigned')
  })

  it('returns uploadUrl, fileId, and photoUrl', async () => {
    const result = await generatePresignedUploadUrl(() => 'test-uuid')
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned')
    expect(result.fileId).toBe('test-uuid')
    expect(result.photoUrl).toBe('https://food-photos.example.com/test-uuid')
  })

  it('generates a unique fileId each call', async () => {
    let counter = 0
    const fakeUUID = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`
    const [a, b] = await Promise.all([generatePresignedUploadUrl(fakeUUID), generatePresignedUploadUrl(fakeUUID)])
    expect(a.fileId).not.toBe(b.fileId)
  })

  it('calls getSignedUrl with PutObjectCommand for photos/ prefix', async () => {
    await generatePresignedUploadUrl(() => 'test-uuid')
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(PutObjectCommand),
      expect.objectContaining({ expiresIn: 3600 }),
    )
  })
})
