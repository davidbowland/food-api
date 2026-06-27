import { ForbiddenError, NotFoundError } from '@errors'

import { handler } from '@handlers/recipes'
import * as service from '@services/recipes'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/recipes')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (
  method: string,
  path: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
  authed = true,
): APIGatewayProxyEventV2 =>
  ({
    rawPath: path,
    requestContext: {
      http: { method },
      ...(authed ? { authorizer: { jwt: { claims: { sub: 'u-1' } } } } : {}),
    },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const recipe = { recipeId: 'rec-1', title: 'Tacos', status: 'published', authorUserId: 'u-1' }

describe('GET /recipes (public)', () => {
  beforeAll(() => {
    jest.mocked(service.listPublishedRecipes).mockResolvedValue([recipe] as any)
  })
  it('returns 200 with recipe list', async () => {
    const result = await handler(makeEvent('GET', '/v1/recipes', undefined, undefined, false))
    expect(result.statusCode).toBe(200)
  })
})

describe('GET /users/me/recipes', () => {
  beforeAll(() => {
    jest.mocked(service.listMyRecipes).mockResolvedValue([recipe] as any)
  })
  it('returns 200 with my recipes', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/recipes'))
    expect(result.statusCode).toBe(200)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/recipes', undefined, undefined, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('POST /recipes', () => {
  beforeAll(() => {
    jest.mocked(service.createRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 201 on success', async () => {
    const result = await handler(
      makeEvent('POST', '/v1/recipes', undefined, { title: 'X', description: 'Y', ingredients: [], steps: [] }),
    )
    expect(result.statusCode).toBe(201)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('POST', '/v1/recipes', undefined, {}, false))
    expect(result.statusCode).toBe(401)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({ ...makeEvent('POST', '/v1/recipes'), body: 'not-valid-json' } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('GET /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 200 (public access)', async () => {
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for draft visible to non-owner', async () => {
    jest.mocked(service.getRecipe).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(403)
  })
  it('returns 404 when not found', async () => {
    jest.mocked(service.getRecipe).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', '/v1/recipes/rec-1', { id: 'rec-1' }, { title: 'Updated' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.updateRecipe).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', '/v1/recipes/rec-1', { id: 'rec-1' }, { title: 'X' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({
      ...makeEvent('PUT', '/v1/recipes/rec-1', { id: 'rec-1' }),
      body: 'not-valid-json',
    } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('DELETE /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.deleteRecipe).mockResolvedValue(undefined)
  })
  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', '/v1/recipes/rec-1', { id: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('DELETE', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('unmatched route', () => {
  it('returns 404 for unrecognized method', async () => {
    const result = await handler(makeEvent('PATCH', '/v1/recipes', undefined, undefined, false))
    expect(result.statusCode).toBe(404)
  })
})
