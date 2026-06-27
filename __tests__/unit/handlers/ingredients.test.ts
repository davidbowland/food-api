import { ForbiddenError, NotFoundError, ValidationError } from '@errors'

import { handler } from '@handlers/ingredients'
import * as service from '@services/ingredients'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/ingredients')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (method: string, pathParameters?: Record<string, string>, body?: unknown): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const ingredient = { ingredientId: 'ing-1', name: 'Flour', allowedUnitTypes: ['volume'], createdAt: 1, updatedAt: 1 }

describe('GET /ingredients', () => {
  beforeAll(() => {
    jest.mocked(service.listIngredients).mockResolvedValue([ingredient])
  })

  it('returns 200 with ingredient list', async () => {
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual([ingredient])
  })
})

describe('POST /ingredients', () => {
  beforeAll(() => {
    jest.mocked(service.createIngredient).mockResolvedValue(ingredient)
  })

  it('returns 201 with created ingredient', async () => {
    const result = await handler(makeEvent('POST', undefined, { name: 'Flour', allowedUnitTypes: ['volume'] }))
    expect(result.statusCode).toBe(201)
    expect(JSON.parse(result.body as string)).toEqual(ingredient)
  })

  it('returns 400 when body is invalid JSON', async () => {
    const event = { ...makeEvent('POST'), body: 'not-json' }
    const result = await handler(event as unknown as APIGatewayProxyEventV2)
    expect(result.statusCode).toBe(400)
  })

  it('returns 400 when body is missing', async () => {
    const result = await handler(makeEvent('POST'))
    expect(result.statusCode).toBe(400)
  })
})

describe('GET /ingredients/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getIngredient).mockResolvedValue(ingredient)
  })

  it('returns 200 with ingredient', async () => {
    const result = await handler(makeEvent('GET', { id: 'ing-1' }))
    expect(result.statusCode).toBe(200)
  })

  it('returns 404 when not found', async () => {
    jest.mocked(service.getIngredient).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', { id: 'missing' }))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /ingredients/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateIngredient).mockResolvedValue(ingredient)
  })

  it('returns 200 with updated ingredient', async () => {
    const result = await handler(makeEvent('PUT', { id: 'ing-1' }, { name: 'Bread Flour' }))
    expect(result.statusCode).toBe(200)
  })

  it('returns 400 when PUT body is invalid JSON', async () => {
    const event = { ...makeEvent('PUT', { id: 'ing-1' }), body: 'not-json' }
    const result = await handler(event as unknown as APIGatewayProxyEventV2)
    expect(result.statusCode).toBe(400)
  })

  it('returns 400 when PUT body is missing', async () => {
    const result = await handler(makeEvent('PUT', { id: 'ing-1' }))
    expect(result.statusCode).toBe(400)
  })
})

describe('unknown method', () => {
  it('returns 404 for unmatched method/path combos', async () => {
    const result = await handler(makeEvent('DELETE'))
    expect(result.statusCode).toBe(404)
  })
})

describe('error handling', () => {
  it('returns 500 for unexpected errors', async () => {
    jest.mocked(service.listIngredients).mockRejectedValueOnce(new Error('unexpected'))
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(500)
  })

  it('returns 400 for ValidationError', async () => {
    jest.mocked(service.listIngredients).mockRejectedValueOnce(new ValidationError('bad input'))
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(400)
  })

  it('returns 403 for ForbiddenError', async () => {
    jest.mocked(service.listIngredients).mockRejectedValueOnce(new ForbiddenError('forbidden'))
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(403)
  })
})
