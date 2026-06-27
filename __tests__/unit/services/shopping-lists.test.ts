import * as ingredientData from '@data/ingredients'
import * as mealPlanData from '@data/meal-plans'
import * as recipeData from '@data/recipes'
import * as data from '@data/shopping-lists'
import { ForbiddenError, NotFoundError } from '@errors'

import * as generator from '@services/shopping-list-generator'
import {
  listMyShoppingLists,
  getShoppingList,
  createShoppingList,
  updateShoppingList,
  deleteShoppingList,
  checkItem,
  uncheckItem,
  upsertShare,
  removeShare,
} from '@services/shopping-lists'
import { generateId } from '@utils/id-generator'

jest.mock('@data/shopping-lists')
jest.mock('@data/meal-plans')
jest.mock('@data/recipes')
jest.mock('@data/ingredients')
jest.mock('@services/shopping-list-generator')
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const item = { itemId: 'item-1', quantity: 2, unit: 'kg' }
const list = {
  listId: 'list-1',
  ownerUserId: 'u-1',
  title: 'Weekly Shop',
  items: [item],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}
const sharedList = { ...list, shares: [{ userId: 'u-2', role: 'viewer' as const }] }
const editorSharedList = { ...list, shares: [{ userId: 'u-2', role: 'editor' as const }] }

describe('listMyShoppingLists', () => {
  beforeAll(() => {
    jest.mocked(data.listShoppingListsByOwner).mockResolvedValue([list])
    jest.mocked(data.listSharedListIds).mockResolvedValue([])
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
  })
  it('returns owned lists', async () => {
    const result = await listMyShoppingLists('u-1')
    expect(result).toContainEqual(list)
  })
  it('includes shared lists', async () => {
    jest.mocked(data.listSharedListIds).mockResolvedValueOnce(['list-2'])
    jest.mocked(data.getShoppingList).mockResolvedValueOnce({ ...list, listId: 'list-2' })
    const result = await listMyShoppingLists('u-1')
    expect(result.some((l) => l.listId === 'list-2')).toBe(true)
  })
})

describe('getShoppingList', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
  })
  it('returns list for owner', async () => expect(await getShoppingList('list-1', 'u-1')).toEqual(list))
  it('returns list for shared viewer', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(sharedList)
    expect(await getShoppingList('list-1', 'u-2')).toEqual(sharedList)
  })
  it('throws ForbiddenError for unrelated user', async () => {
    await expect(getShoppingList('list-1', 'u-stranger')).rejects.toThrow(ForbiddenError)
  })
})

describe('createShoppingList', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('list-new')
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
  })
  it('creates list with generated id and empty defaults', async () => {
    const result = await createShoppingList('u-1', { title: 'My List' }, () => 2_000_000)
    expect(result.listId).toBe('list-new')
    expect(result.items).toEqual([])
    expect(result.shares).toEqual([])
    expect(result.createdAt).toBe(2_000_000)
    expect(result.title).toBe('My List')
  })
  it('assigns itemId to manually provided items', async () => {
    // items get IDs first, then the list itself
    jest.mocked(generateId).mockReturnValueOnce('item-gen').mockReturnValueOnce('list-new')
    const result = await createShoppingList('u-1', { items: [{ quantity: 1, unit: 'kg' }] }, () => 2_000_000)
    expect(result.items[0].itemId).toBe('item-gen')
  })
})

describe('createShoppingList with generatedFromPlanId', () => {
  const plan = {
    planId: 'plan-1',
    ownerUserId: 'u-1',
    title: 'Week 1',
    items: [{ recipeId: 'recipe-1', servings: 2 }],
    shares: [],
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
  }
  const recipe = {
    recipeId: 'recipe-1',
    title: 'Pasta',
    description: '',
    servings: 2,
    ingredients: [],
    steps: [],
    tags: [],
    photos: [],
    authorUserId: 'u-1',
    status: 'published' as const,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
  }
  const generatedItems = [{ itemId: 'gen-item-1', ingredientId: 'ing-1', quantity: 500, unit: 'g' }]

  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('list-new')
    jest.mocked(mealPlanData.getMealPlan).mockResolvedValue(plan)
    jest.mocked(recipeData.getRecipe).mockResolvedValue(recipe)
    jest.mocked(ingredientData.listIngredients).mockResolvedValue([])
    jest.mocked(generator.generateShoppingListItems).mockReturnValue(generatedItems)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
  })
  it('fetches plan, recipes, ingredients and calls generator', async () => {
    const result = await createShoppingList('u-1', { generatedFromPlanId: 'plan-1' }, () => 3_000_000)
    expect(mealPlanData.getMealPlan).toHaveBeenCalledWith('plan-1')
    expect(recipeData.getRecipe).toHaveBeenCalledWith('recipe-1')
    expect(ingredientData.listIngredients).toHaveBeenCalled()
    expect(generator.generateShoppingListItems).toHaveBeenCalled()
    expect(result.items).toEqual(generatedItems)
    expect(result.generatedFromPlanId).toBe('plan-1')
  })
})

describe('updateShoppingList', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
  })
  it('updates list for owner', async () => {
    const result = await updateShoppingList('list-1', 'u-1', { title: 'Updated' }, () => 5_000_000)
    expect(result.title).toBe('Updated')
    expect(result.updatedAt).toBe(5_000_000)
  })
  it('updates list for editor', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(editorSharedList)
    const result = await updateShoppingList('list-1', 'u-2', { title: 'Editor Updated' }, () => 5_000_000)
    expect(result.title).toBe('Editor Updated')
  })
  it('throws ForbiddenError for viewer attempting update', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(sharedList)
    await expect(updateShoppingList('list-1', 'u-2', { title: 'X' })).rejects.toThrow(ForbiddenError)
  })
  it('does not allow ownerUserId to be overwritten', async () => {
    const result = await updateShoppingList('list-1', 'u-1', { ownerUserId: 'attacker' } as any, () => 5_000_000)
    expect(result.ownerUserId).toBe('u-1')
  })
  it('does not allow listId to be overwritten', async () => {
    const result = await updateShoppingList('list-1', 'u-1', { listId: 'evil-list' } as any, () => 5_000_000)
    expect(result.listId).toBe('list-1')
  })
  it('does not allow shares to be overwritten', async () => {
    const result = await updateShoppingList(
      'list-1',
      'u-1',
      { shares: [{ userId: 'attacker', role: 'editor' }] } as any,
      () => 5_000_000,
    )
    expect(result.shares).toEqual([])
  })
  it('does not allow createdAt to be overwritten', async () => {
    const result = await updateShoppingList('list-1', 'u-1', { createdAt: 0 } as any, () => 5_000_000)
    expect(result.createdAt).toBe(1_000_000)
  })
})

describe('deleteShoppingList', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
    jest.mocked(data.deleteShoppingList).mockResolvedValue(undefined)
  })
  it('deletes for owner', async () => {
    await deleteShoppingList('list-1', 'u-1')
    expect(data.deleteShoppingList).toHaveBeenCalledWith('list-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(deleteShoppingList('list-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })
})

describe('checkItem', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
  })
  it('checks item and stores checkedBy/checkedAt', async () => {
    const result = await checkItem('list-1', 'item-1', 'u-1', () => 9_000_000)
    const checked = result.items.find((i) => i.itemId === 'item-1')
    expect(checked?.checkedBy).toBe('u-1')
    expect(checked?.checkedAt).toBe(9_000_000)
  })
  it('throws ForbiddenError for unrelated user', async () => {
    await expect(checkItem('list-1', 'item-1', 'u-stranger')).rejects.toThrow(ForbiddenError)
  })
  it('throws NotFoundError for unknown itemId', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(list)
    await expect(checkItem('list-1', 'no-such-item', 'u-1')).rejects.toThrow(NotFoundError)
  })
  it('allows shared viewer to check item', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(sharedList)
    const result = await checkItem('list-1', 'item-1', 'u-2', () => 9_000_000)
    expect(result.items.find((i) => i.itemId === 'item-1')?.checkedBy).toBe('u-2')
  })
})

describe('uncheckItem', () => {
  const checkedList = {
    ...list,
    items: [{ itemId: 'item-1', quantity: 2, unit: 'kg', checkedBy: 'u-1', checkedAt: 9_000_000 }],
  }
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(checkedList)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
  })
  it('removes checkedBy and checkedAt', async () => {
    const result = await uncheckItem('list-1', 'item-1', 'u-1')
    const unchecked = result.items.find((i) => i.itemId === 'item-1')
    expect(unchecked?.checkedBy).toBeUndefined()
    expect(unchecked?.checkedAt).toBeUndefined()
  })
  it('throws ForbiddenError for unrelated user', async () => {
    await expect(uncheckItem('list-1', 'item-1', 'u-stranger')).rejects.toThrow(ForbiddenError)
  })
  it('throws NotFoundError for unknown itemId', async () => {
    jest.mocked(data.getShoppingList).mockResolvedValueOnce(checkedList)
    await expect(uncheckItem('list-1', 'no-such-item', 'u-1')).rejects.toThrow(NotFoundError)
  })
})

describe('upsertShare', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(list)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
    jest.mocked(data.putSharedListIndex).mockResolvedValue(undefined)
  })
  it('adds share and updates index for owner', async () => {
    const result = await upsertShare('list-1', 'u-1', 'u-2', 'editor')
    expect(result.shares).toContainEqual({ userId: 'u-2', role: 'editor' })
    expect(data.putSharedListIndex).toHaveBeenCalledWith('u-2', 'list-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(upsertShare('list-1', 'u-stranger', 'u-2', 'viewer')).rejects.toThrow(ForbiddenError)
  })
})

describe('removeShare', () => {
  beforeAll(() => {
    jest.mocked(data.getShoppingList).mockResolvedValue(sharedList)
    jest.mocked(data.putShoppingList).mockResolvedValue(undefined)
    jest.mocked(data.deleteSharedListIndex).mockResolvedValue(undefined)
  })
  it('removes share and deletes index for owner', async () => {
    const result = await removeShare('list-1', 'u-1', 'u-2')
    expect(result.shares).not.toContainEqual(expect.objectContaining({ userId: 'u-2' }))
    expect(data.deleteSharedListIndex).toHaveBeenCalledWith('u-2', 'list-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(removeShare('list-1', 'u-stranger', 'u-2')).rejects.toThrow(ForbiddenError)
  })
})
