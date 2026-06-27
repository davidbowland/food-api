import { handler } from '@handlers/users'
import * as service from '@services/users'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/users')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (
  method: string,
  path: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
): APIGatewayProxyEventV2 =>
  ({
    rawPath: path,
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'u-1', phone_number: '+15551234567' } } } },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const user = { userId: 'u-1', phone: '+15551234567', displayName: 'Alice', createdAt: 1 }

describe('GET /users/me', () => {
  beforeAll(() => {
    jest.mocked(service.getOrCreateUser).mockResolvedValue(user)
  })

  it('returns 200 with user', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual(user)
  })

  it('returns 200 when phone is absent from JWT', async () => {
    const event = {
      rawPath: '/v1/users/me',
      requestContext: { http: { method: 'GET' }, authorizer: { jwt: { claims: { sub: 'u-1' } } } },
    } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(200)
  })

  it('returns 401 when unauthenticated', async () => {
    const event = {
      rawPath: '/v1/users/me',
      requestContext: { http: { method: 'GET' } },
    } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
  })
})

describe('PUT /users/me', () => {
  beforeAll(() => {
    jest.mocked(service.updateUser).mockResolvedValue({ ...user, displayName: 'Bob' })
  })

  it('returns 200 with updated user', async () => {
    const result = await handler(makeEvent('PUT', '/v1/users/me', undefined, { displayName: 'Bob' }))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string).displayName).toBe('Bob')
  })

  it('returns 400 when body is absent', async () => {
    const event = {
      rawPath: '/v1/users/me',
      requestContext: {
        http: { method: 'PUT' },
        authorizer: { jwt: { claims: { sub: 'u-1', phone_number: '+15551234567' } } },
      },
    } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(400)
  })
})

describe('GET /users/me/favorites', () => {
  beforeAll(() => {
    jest.mocked(service.listFavorites).mockResolvedValue(['rec-1'])
  })

  it('returns 200 with favorites list', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/favorites'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual(['rec-1'])
  })
})

describe('PUT /users/me/favorites/{recipeId}', () => {
  beforeAll(() => {
    jest.mocked(service.addFavorite).mockResolvedValue(undefined)
  })

  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('PUT', '/v1/users/me/favorites/rec-1', { recipeId: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
})

describe('DELETE /users/me/favorites/{recipeId}', () => {
  beforeAll(() => {
    jest.mocked(service.removeFavorite).mockResolvedValue(undefined)
  })

  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', '/v1/users/me/favorites/rec-1', { recipeId: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
})

describe('PUT /users/me with invalid body', () => {
  it('returns 400 when body is not valid JSON', async () => {
    const event = {
      rawPath: '/v1/users/me',
      requestContext: {
        http: { method: 'PUT' },
        authorizer: { jwt: { claims: { sub: 'u-1', phone_number: '+15551234567' } } },
      },
      body: 'not-valid-json',
    } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(400)
  })
})

describe('unmatched route', () => {
  it('returns 404 for unknown method/path combo', async () => {
    const result = await handler(makeEvent('PATCH', '/v1/users/me'))
    expect(result.statusCode).toBe(404)
  })
})

describe('service error handling', () => {
  it('returns 500 when service throws unexpected error', async () => {
    jest.mocked(service.getOrCreateUser).mockRejectedValueOnce(new Error('DB error'))
    const result = await handler(makeEvent('GET', '/v1/users/me'))
    expect(result.statusCode).toBe(500)
  })
})
