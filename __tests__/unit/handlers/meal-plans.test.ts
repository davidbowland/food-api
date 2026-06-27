import { ForbiddenError, NotFoundError } from '@errors'

import { handler } from '@handlers/meal-plans'
import * as service from '@services/meal-plans'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/meal-plans')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (
  method: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
  authed = true,
): APIGatewayProxyEventV2 =>
  ({
    requestContext: {
      http: { method },
      ...(authed ? { authorizer: { jwt: { claims: { sub: 'u-1' } } } } : {}),
    },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const plan = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Week 1',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('GET /meal-plans (list)', () => {
  beforeAll(() => {
    jest.mocked(service.listMyMealPlans).mockResolvedValue([plan])
  })
  it('returns 200 with plan list', async () => {
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(200)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('GET', undefined, undefined, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('POST /meal-plans (create)', () => {
  beforeAll(() => {
    jest.mocked(service.createMealPlan).mockResolvedValue(plan)
  })
  it('returns 201 on success', async () => {
    const result = await handler(makeEvent('POST', undefined, { title: 'Week 1' }))
    expect(result.statusCode).toBe(201)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('POST', undefined, { title: 'X' }, false))
    expect(result.statusCode).toBe(401)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({ ...makeEvent('POST'), body: 'not-valid-json' } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('GET /meal-plans/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getMealPlan).mockResolvedValue(plan)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('GET', { id: 'plan-1' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 when access denied', async () => {
    jest.mocked(service.getMealPlan).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('GET', { id: 'plan-1' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 404 when not found', async () => {
    jest.mocked(service.getMealPlan).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', { id: 'plan-1' }))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /meal-plans/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateMealPlan).mockResolvedValue(plan)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', { id: 'plan-1' }, { title: 'Updated' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.updateMealPlan).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', { id: 'plan-1' }, { title: 'X' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({ ...makeEvent('PUT', { id: 'plan-1' }), body: 'not-valid-json' } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('DELETE /meal-plans/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.deleteMealPlan).mockResolvedValue(undefined)
  })
  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'plan-1' }))
    expect(result.statusCode).toBe(204)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'plan-1' }, undefined, false))
    expect(result.statusCode).toBe(401)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.deleteMealPlan).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('DELETE', { id: 'plan-1' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('PUT /meal-plans/{id}/shares/{userId}', () => {
  beforeAll(() => {
    jest.mocked(service.upsertShare).mockResolvedValue({ ...plan, shares: [{ userId: 'u-2', role: 'editor' }] })
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', { id: 'plan-1', userId: 'u-2' }, { role: 'editor' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.upsertShare).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', { id: 'plan-1', userId: 'u-2' }, { role: 'viewer' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({
      ...makeEvent('PUT', { id: 'plan-1', userId: 'u-2' }),
      body: 'not-valid-json',
    } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('DELETE /meal-plans/{id}/shares/{userId}', () => {
  beforeAll(() => {
    jest.mocked(service.removeShare).mockResolvedValue(plan)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'plan-1', userId: 'u-2' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.removeShare).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('DELETE', { id: 'plan-1', userId: 'u-2' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('unmatched route', () => {
  it('returns 404 for unrecognized method', async () => {
    const result = await handler(makeEvent('PATCH'))
    expect(result.statusCode).toBe(404)
  })
})
