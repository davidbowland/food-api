import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { generatePresignedUploadUrl } from '@services/photos'

jest.mock('@aws-sdk/client-s3')
jest.mock('@aws-sdk/s3-request-presigner')
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x) }))
jest.mock('@config', () => ({
  photoBucketName: 'test-bucket',
  photoPresignedUrlExpireSeconds: 3600,
}))

describe('generatePresignedUploadUrl', () => {
  beforeAll(() => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/presigned')
  })

  it('returns a presigned URL and a key', async () => {
    const result = await generatePresignedUploadUrl(() => crypto.randomUUID())
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned')
    expect(result.key).toMatch(/^photos\//)
  })

  it('generates a unique key each call', async () => {
    let counter = 0
    const fakeUUID = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`
    const [a, b] = await Promise.all([generatePresignedUploadUrl(fakeUUID), generatePresignedUploadUrl(fakeUUID)])
    expect(a.key).not.toBe(b.key)
  })

  it('calls getSignedUrl with PutObjectCommand', async () => {
    await generatePresignedUploadUrl()
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(PutObjectCommand),
      expect.objectContaining({ expiresIn: 3600 }),
    )
  })
})
