import { GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { getIngredient, putIngredient, deleteIngredient, listIngredients } from '@data/ingredients'
import { NotFoundError } from '@errors'

import { IngredientRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const ingredient: IngredientRecord = {
  ingredientId: 'ing-1',
  name: 'Flour',
  allowedUnitTypes: ['volume', 'weight'],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(ingredient) } } } as any)
  })

  it('returns parsed ingredient record', async () => {
    const result = await getIngredient('ing-1')
    expect(result).toEqual(ingredient)
  })

  it('sends GetItemCommand with correct key', async () => {
    await getIngredient('ing-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(GetItemCommand)
    expect((call as GetItemCommand).input.Key).toEqual({
      PK: { S: 'INGREDIENT#ing-1' },
      SK: { S: 'METADATA' },
    })
  })

  it('throws NotFoundError when item missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getIngredient('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with correct structure', async () => {
    await putIngredient(ingredient)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(PutItemCommand)
    const input = (call as PutItemCommand).input
    expect(input.Item?.PK).toEqual({ S: 'INGREDIENT#ing-1' })
    expect(input.Item?.SK).toEqual({ S: 'METADATA' })
    expect(input.Item?.entityType).toEqual({ S: 'ingredient' })
    expect(JSON.parse(input.Item?.Data?.S ?? '')).toEqual(ingredient)
  })
})

describe('deleteIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with correct key', async () => {
    await deleteIngredient('ing-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(DeleteItemCommand)
    expect((call as DeleteItemCommand).input.Key).toEqual({
      PK: { S: 'INGREDIENT#ing-1' },
      SK: { S: 'METADATA' },
    })
  })
})

describe('listIngredients', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(ingredient) } }],
    } as any)
  })

  it('returns list of ingredients', async () => {
    const result = await listIngredients()
    expect(result).toEqual([ingredient])
  })

  it('sends QueryCommand against type-index', async () => {
    await listIngredients()
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(QueryCommand)
    expect((call as QueryCommand).input.IndexName).toBe('type-index')
  })

  it('returns empty array when no items', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as any)
    expect(await listIngredients()).toEqual([])
  })

  it('returns empty array when Items is undefined', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({} as any)
    expect(await listIngredients()).toEqual([])
  })

  it('handles items with missing Data field', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{}] } as any)
    const result = await listIngredients()
    expect(result).toEqual([{}])
  })
})
