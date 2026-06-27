import * as data from '@data/meal-plans'
import { ForbiddenError } from '@errors'

import {
  listMyMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  upsertShare,
  removeShare,
} from '@services/meal-plans'
import { generateId } from '@utils/id-generator'

jest.mock('@data/meal-plans')
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const plan = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Week 1',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}
const sharedPlan = { ...plan, shares: [{ userId: 'u-2', role: 'viewer' as const }] }

describe('listMyMealPlans', () => {
  beforeAll(() => {
    jest.mocked(data.listMealPlansByOwner).mockResolvedValue([plan])
    jest.mocked(data.listSharedPlanIds).mockResolvedValue([])
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
  })
  it('returns owned plans', async () => {
    const result = await listMyMealPlans('u-1')
    expect(result).toContainEqual(plan)
  })
})

describe('getMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
  })
  it('returns plan for owner', async () => expect(await getMealPlan('plan-1', 'u-1')).toEqual(plan))
  it('returns plan for shared viewer', async () => {
    jest.mocked(data.getMealPlan).mockResolvedValueOnce(sharedPlan)
    expect(await getMealPlan('plan-1', 'u-2')).toEqual(sharedPlan)
  })
  it('throws ForbiddenError for unrelated user', async () => {
    await expect(getMealPlan('plan-1', 'u-stranger')).rejects.toThrow(ForbiddenError)
  })
})

describe('createMealPlan', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('plan-new')
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
  })
  it('creates plan with generated id and empty defaults', async () => {
    const result = await createMealPlan('u-1', { title: 'My Plan' }, () => 2_000_000)
    expect(result.planId).toBe('plan-new')
    expect(result.items).toEqual([])
    expect(result.shares).toEqual([])
    expect(result.createdAt).toBe(2_000_000)
  })
})

describe('updateMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
  })
  it('updates plan for owner', async () => {
    const result = await updateMealPlan('plan-1', 'u-1', { title: 'Updated' }, () => 5_000_000)
    expect(result.title).toBe('Updated')
    expect(result.updatedAt).toBe(5_000_000)
  })
  it('throws ForbiddenError for viewer attempting update', async () => {
    jest.mocked(data.getMealPlan).mockResolvedValueOnce(sharedPlan)
    await expect(updateMealPlan('plan-1', 'u-2', { title: 'X' })).rejects.toThrow(ForbiddenError)
  })
})

describe('deleteMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.deleteMealPlan).mockResolvedValue(undefined)
  })
  it('deletes for owner', async () => {
    await deleteMealPlan('plan-1', 'u-1')
    expect(data.deleteMealPlan).toHaveBeenCalledWith('plan-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(deleteMealPlan('plan-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })
})

describe('upsertShare', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
    jest.mocked(data.putSharedPlanIndex).mockResolvedValue(undefined)
  })
  it('adds share and updates index for owner', async () => {
    const result = await upsertShare('plan-1', 'u-1', 'u-2', 'editor')
    expect(result.shares).toContainEqual({ userId: 'u-2', role: 'editor' })
    expect(data.putSharedPlanIndex).toHaveBeenCalledWith('u-2', 'plan-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(upsertShare('plan-1', 'u-stranger', 'u-2', 'viewer')).rejects.toThrow(ForbiddenError)
  })
})

describe('removeShare', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(sharedPlan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
    jest.mocked(data.deleteSharedPlanIndex).mockResolvedValue(undefined)
  })
  it('removes share and deletes index for owner', async () => {
    const result = await removeShare('plan-1', 'u-1', 'u-2')
    expect(result.shares).not.toContainEqual(expect.objectContaining({ userId: 'u-2' }))
    expect(data.deleteSharedPlanIndex).toHaveBeenCalledWith('u-2', 'plan-1')
  })
})
