import { DeleteItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import {
  getShoppingList,
  putShoppingList,
  deleteShoppingList,
  listShoppingListsByOwner,
  putSharedListIndex,
  deleteSharedListIndex,
  listSharedListIds,
} from '@data/shopping-lists'
import { NotFoundError } from '@errors'

import { ShoppingListRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const list: ShoppingListRecord = {
  listId: 'list-1',
  ownerUserId: 'u-1',
  title: 'Weekly Shop',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getShoppingList', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(list) } } } as any)
  })
  it('returns parsed shopping list', async () => expect(await getShoppingList('list-1')).toEqual(list))
  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getShoppingList('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putShoppingList', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends PutItemCommand with PK=LIST#', async () => {
    await putShoppingList(list)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.PK).toEqual({ S: 'LIST#list-1' })
    expect(call.input.Item?.ownerUserId).toEqual({ S: 'u-1' })
  })
})

describe('deleteShoppingList', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends DeleteItemCommand with correct PK', async () => {
    await deleteShoppingList('list-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'LIST#list-1' })
  })
})

describe('listShoppingListsByOwner', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Items: [{ Data: { S: JSON.stringify(list) } }] } as any)
  })
  it('queries owner-index', async () => {
    await listShoppingListsByOwner('u-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('owner-index')
  })
})

describe('putSharedListIndex and listSharedListIds', () => {
  beforeAll(() => {
    jest
      .mocked(dynamodb.send)
      .mockResolvedValueOnce({} as any) // putSharedListIndex
      .mockResolvedValue({ Items: [{ listId: { S: 'list-1' } }] } as any)
  })
  it('puts shared list index item', async () => {
    await putSharedListIndex('u-2', 'list-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.SK).toEqual({ S: 'SHARED_LIST#list-1' })
  })
  it('lists shared list ids', async () => {
    const ids = await listSharedListIds('u-2')
    expect(ids).toEqual(['list-1'])
  })
})

describe('deleteSharedListIndex', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends DeleteItemCommand with correct SK', async () => {
    await deleteSharedListIndex('u-2', 'list-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.SK).toEqual({ S: 'SHARED_LIST#list-1' })
    expect(call.input.Key?.PK).toEqual({ S: 'USER#u-2' })
  })
})
