import { PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { getRecipe, putRecipe, deleteRecipe, listPublishedRecipes, listRecipesByAuthor } from '@data/recipes'
import { NotFoundError } from '@errors'

import { RecipeRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const recipe: RecipeRecord = {
  recipeId: 'rec-1',
  title: 'Tacos',
  description: 'Great tacos',
  servings: 2,
  ingredients: [],
  steps: [],
  tags: [],
  photos: [],
  authorUserId: 'u-1',
  status: 'published',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(recipe) } } } as any)
  })

  it('returns parsed recipe', async () => {
    expect(await getRecipe('rec-1')).toEqual(recipe)
  })

  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getRecipe('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with recipeStatus and ownerUserId attributes', async () => {
    await putRecipe(recipe)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.recipeStatus).toEqual({ S: 'published' })
    expect(call.input.Item?.ownerUserId).toEqual({ S: 'u-1' })
    expect(call.input.Item?.entityType).toEqual({ S: 'recipe' })
  })
})

describe('deleteRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with correct key', async () => {
    await deleteRecipe('rec-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'RECIPE#rec-1' })
  })
})

describe('listPublishedRecipes', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(recipe) } }],
    } as any)
  })

  it('queries status-index for published', async () => {
    await listPublishedRecipes()
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('status-index')
    expect(call.input.ExpressionAttributeValues?.[':status']).toEqual({ S: 'published' })
  })

  it('returns parsed recipes', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{ Data: { S: JSON.stringify(recipe) } }] } as any)
    expect(await listPublishedRecipes()).toEqual([recipe])
  })

  it('returns empty array when Items is undefined', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({} as any)
    expect(await listPublishedRecipes()).toEqual([])
  })

  it('handles items with missing Data field', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{}] } as any)
    expect(await listPublishedRecipes()).toEqual([{}])
  })
})

describe('listRecipesByAuthor', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(recipe) } }],
    } as any)
  })

  it('queries owner-index for author', async () => {
    await listRecipesByAuthor('u-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('owner-index')
    expect(call.input.ExpressionAttributeValues?.[':owner']).toEqual({ S: 'u-1' })
  })

  it('returns empty array when Items is undefined', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({} as any)
    expect(await listRecipesByAuthor('u-1')).toEqual([])
  })

  it('handles items with missing Data field', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{}] } as any)
    expect(await listRecipesByAuthor('u-1')).toEqual([{}])
  })
})
