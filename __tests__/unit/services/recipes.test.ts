import * as data from '@data/recipes'
import { ForbiddenError } from '@errors'

import {
  listPublishedRecipes,
  listMyRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from '@services/recipes'
import { generateId } from '@utils/id-generator'

jest.mock('@data/recipes')
jest.mock('@services/photos', () => ({ buildPhotoUrl: (id: string) => `https://cdn.example.com/${id}` }))
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const recipe = {
  recipeId: 'rec-1',
  title: 'Tacos',
  description: 'Great',
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

describe('listPublishedRecipes', () => {
  beforeAll(() => {
    jest.mocked(data.listPublishedRecipes).mockResolvedValue([recipe])
  })
  it('returns published recipes', async () => expect(await listPublishedRecipes()).toEqual([recipe]))
})

describe('listMyRecipes', () => {
  beforeAll(() => {
    jest.mocked(data.listRecipesByAuthor).mockResolvedValue([recipe])
  })
  it('returns recipes by author', async () => expect(await listMyRecipes('u-1')).toEqual([recipe]))
})

describe('getRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
  })

  it('returns published recipe to any requester', async () => {
    expect(await getRecipe('rec-1')).toEqual(recipe)
  })

  it('returns draft recipe to owner', async () => {
    const draft = { ...recipe, status: 'draft' as const }
    jest.mocked(data.getRecipe).mockResolvedValueOnce(draft)
    expect(await getRecipe('rec-1', 'u-1')).toEqual(draft)
  })

  it('throws ForbiddenError for draft requested by non-owner', async () => {
    jest.mocked(data.getRecipe).mockResolvedValueOnce({ ...recipe, status: 'draft' as const })
    await expect(getRecipe('rec-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError for draft requested with no userId', async () => {
    jest.mocked(data.getRecipe).mockResolvedValueOnce({ ...recipe, status: 'draft' as const })
    await expect(getRecipe('rec-1')).rejects.toThrow(ForbiddenError)
  })

  it('expands photo fileIds to CDN URLs', async () => {
    jest.mocked(data.getRecipe).mockResolvedValueOnce({ ...recipe, photos: ['file-id-1', 'file-id-2'] })
    const result = await getRecipe('rec-1')
    expect(result.photos).toEqual(['https://cdn.example.com/file-id-1', 'https://cdn.example.com/file-id-2'])
  })
})

describe('createRecipe', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('rec-new')
    jest.mocked(data.putRecipe).mockResolvedValue(undefined)
  })

  it('creates recipe with generated id and draft status', async () => {
    const result = await createRecipe(
      'u-1',
      { title: 'Soup', description: 'Hot', ingredients: [], steps: [] },
      () => 2_000_000,
    )
    expect(result.recipeId).toBe('rec-new')
    expect(result.status).toBe('draft')
    expect(result.authorUserId).toBe('u-1')
    expect(result.createdAt).toBe(2_000_000)
    expect(result.servings).toBe(2)
  })
})

describe('updateRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
    jest.mocked(data.putRecipe).mockResolvedValue(undefined)
  })

  it('updates recipe when requester is author', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { title: 'Updated' }, () => 5_000_000)
    expect(result.title).toBe('Updated')
    expect(result.updatedAt).toBe(5_000_000)
  })

  it('throws ForbiddenError when non-author attempts update', async () => {
    await expect(updateRecipe('rec-1', 'u-other', { title: 'X' })).rejects.toThrow(ForbiddenError)
  })
  it('does not allow authorUserId to be overwritten', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { authorUserId: 'attacker' } as any, () => 5_000_000)
    expect(result.authorUserId).toBe('u-1')
  })
  it('does not allow recipeId to be overwritten', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { recipeId: 'evil-id' } as any, () => 5_000_000)
    expect(result.recipeId).toBe('rec-1')
  })
  it('does not allow createdAt to be overwritten', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { createdAt: 0 } as any, () => 5_000_000)
    expect(result.createdAt).toBe(1_000_000)
  })
  it('allows status to be changed by the author', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { status: 'draft' }, () => 5_000_000)
    expect(result.status).toBe('draft')
  })
})

describe('deleteRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
    jest.mocked(data.deleteRecipe).mockResolvedValue(undefined)
  })

  it('deletes when requester is author', async () => {
    await deleteRecipe('rec-1', 'u-1')
    expect(data.deleteRecipe).toHaveBeenCalledWith('rec-1')
  })

  it('throws ForbiddenError for non-author', async () => {
    await expect(deleteRecipe('rec-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })
})
