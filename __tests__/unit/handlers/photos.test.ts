import { handler } from '@handlers/photos'
import * as service from '@services/photos'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/photos')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (method: string): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'u-1' } } } },
  }) as unknown as APIGatewayProxyEventV2

describe('POST /photos', () => {
  beforeAll(() => {
    jest.mocked(service.generatePresignedUploadUrl).mockResolvedValue({
      uploadUrl: 'https://s3.example.com/upload',
      key: 'photos/abc.jpg',
      photoUrl: 'https://food-photos.example.com/abc.jpg',
    })
  })

  it('returns 200 with uploadUrl and key', async () => {
    const result = await handler(makeEvent('POST'))
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.uploadUrl).toBe('https://s3.example.com/upload')
    expect(body.key).toBe('photos/abc.jpg')
    expect(body.photoUrl).toBe('https://food-photos.example.com/abc.jpg')
  })

  it('returns 401 when unauthenticated', async () => {
    const event = { requestContext: { http: { method: 'POST' } } } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
  })
})
