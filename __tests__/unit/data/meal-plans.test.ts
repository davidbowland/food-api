import { PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import {
  getMealPlan,
  putMealPlan,
  deleteMealPlan,
  listMealPlansByOwner,
  putSharedPlanIndex,
  deleteSharedPlanIndex,
  listSharedPlanIds,
} from '@data/meal-plans'
import { NotFoundError } from '@errors'

import { MealPlanRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const plan: MealPlanRecord = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Week 1',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(plan) } } } as any)
  })
  it('returns parsed meal plan', async () => expect(await getMealPlan('plan-1')).toEqual(plan))
  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getMealPlan('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends PutItemCommand with PK=PLAN#', async () => {
    await putMealPlan(plan)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.PK).toEqual({ S: 'PLAN#plan-1' })
    expect(call.input.Item?.ownerUserId).toEqual({ S: 'u-1' })
  })
})

describe('deleteMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends DeleteItemCommand', async () => {
    await deleteMealPlan('plan-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'PLAN#plan-1' })
  })
})

describe('listMealPlansByOwner', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Items: [{ Data: { S: JSON.stringify(plan) } }] } as any)
  })
  it('queries owner-index', async () => {
    await listMealPlansByOwner('u-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('owner-index')
  })
})

describe('putSharedPlanIndex and listSharedPlanIds', () => {
  beforeAll(() => {
    jest
      .mocked(dynamodb.send)
      .mockResolvedValueOnce({} as any) // putSharedPlanIndex
      .mockResolvedValue({ Items: [{ planId: { S: 'plan-1' } }] } as any)
  })
  it('puts shared plan index item', async () => {
    await putSharedPlanIndex('u-2', 'plan-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.SK).toEqual({ S: 'SHARED_PLAN#plan-1' })
  })
  it('lists shared plan ids', async () => {
    const ids = await listSharedPlanIds('u-2')
    expect(ids).toEqual(['plan-1'])
  })
})

describe('deleteSharedPlanIndex', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends DeleteItemCommand with correct SK', async () => {
    await deleteSharedPlanIndex('u-2', 'plan-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.SK).toEqual({ S: 'SHARED_PLAN#plan-1' })
    expect(call.input.Key?.PK).toEqual({ S: 'USER#u-2' })
  })
})
