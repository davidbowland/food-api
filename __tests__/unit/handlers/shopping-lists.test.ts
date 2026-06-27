import { ForbiddenError, NotFoundError } from '@errors'

import { handler } from '@handlers/shopping-lists'
import * as service from '@services/shopping-lists'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/shopping-lists')
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

const list = {
  listId: 'list-1',
  ownerUserId: 'u-1',
  title: 'Weekly Shop',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('GET /shopping-lists (list)', () => {
  beforeAll(() => {
    jest.mocked(service.listMyShoppingLists).mockResolvedValue([list])
  })
  it('returns 200 with list', async () => {
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(200)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('GET', undefined, undefined, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('POST /shopping-lists (create)', () => {
  beforeAll(() => {
    jest.mocked(service.createShoppingList).mockResolvedValue(list)
  })
  it('returns 201 on success', async () => {
    const result = await handler(makeEvent('POST', undefined, { title: 'Weekly Shop' }))
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

describe('GET /shopping-lists/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getShoppingList).mockResolvedValue(list)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('GET', { id: 'list-1' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 when access denied', async () => {
    jest.mocked(service.getShoppingList).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('GET', { id: 'list-1' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 404 when not found', async () => {
    jest.mocked(service.getShoppingList).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', { id: 'list-1' }))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /shopping-lists/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateShoppingList).mockResolvedValue(list)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', { id: 'list-1' }, { title: 'Updated' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-editor', async () => {
    jest.mocked(service.updateShoppingList).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', { id: 'list-1' }, { title: 'X' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({ ...makeEvent('PUT', { id: 'list-1' }), body: 'not-valid-json' } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('DELETE /shopping-lists/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.deleteShoppingList).mockResolvedValue(undefined)
  })
  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'list-1' }))
    expect(result.statusCode).toBe(204)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'list-1' }, undefined, false))
    expect(result.statusCode).toBe(401)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.deleteShoppingList).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('DELETE', { id: 'list-1' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('PUT /shopping-lists/{id}/items/{itemId}/check', () => {
  beforeAll(() => {
    jest.mocked(service.checkItem).mockResolvedValue({
      ...list,
      items: [{ itemId: 'item-1', quantity: 1, unit: 'kg', checkedBy: 'u-1', checkedAt: 9_000_000 }],
    })
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', { id: 'list-1', itemId: 'item-1' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 when access denied', async () => {
    jest.mocked(service.checkItem).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', { id: 'list-1', itemId: 'item-1' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 404 when item not found', async () => {
    jest.mocked(service.checkItem).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('PUT', { id: 'list-1', itemId: 'no-such-item' }))
    expect(result.statusCode).toBe(404)
  })
})

describe('DELETE /shopping-lists/{id}/items/{itemId}/check', () => {
  beforeAll(() => {
    jest.mocked(service.uncheckItem).mockResolvedValue(list)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'list-1', itemId: 'item-1' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 when access denied', async () => {
    jest.mocked(service.uncheckItem).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('DELETE', { id: 'list-1', itemId: 'item-1' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('PUT /shopping-lists/{id}/shares/{userId}', () => {
  beforeAll(() => {
    jest.mocked(service.upsertShare).mockResolvedValue({ ...list, shares: [{ userId: 'u-2', role: 'editor' }] })
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', { id: 'list-1', userId: 'u-2' }, { role: 'editor' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.upsertShare).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', { id: 'list-1', userId: 'u-2' }, { role: 'viewer' }))
    expect(result.statusCode).toBe(403)
  })
  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler({
      ...makeEvent('PUT', { id: 'list-1', userId: 'u-2' }),
      body: 'not-valid-json',
    } as any)
    expect(result.statusCode).toBe(400)
  })
})

describe('DELETE /shopping-lists/{id}/shares/{userId}', () => {
  beforeAll(() => {
    jest.mocked(service.removeShare).mockResolvedValue(list)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('DELETE', { id: 'list-1', userId: 'u-2' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.removeShare).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('DELETE', { id: 'list-1', userId: 'u-2' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('unmatched route', () => {
  it('returns 404 for unrecognized method', async () => {
    const result = await handler(makeEvent('PATCH'))
    expect(result.statusCode).toBe(404)
  })
})
