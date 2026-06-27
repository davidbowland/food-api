import * as data from '../data/recipes'
import { ForbiddenError } from '../errors'
import { RecipeIngredient, RecipeRecord } from '../types'
import { generateId } from '../utils/id-generator'

interface RecipeInput {
  title: string
  description: string
  servings?: number
  ingredients: RecipeIngredient[]
  steps: string[]
  tags?: string[]
  photos?: string[]
}

export const listPublishedRecipes = (): Promise<RecipeRecord[]> => data.listPublishedRecipes()

export const listMyRecipes = (userId: string): Promise<RecipeRecord[]> => data.listRecipesByAuthor(userId)

export const getRecipe = async (recipeId: string, requestingUserId?: string): Promise<RecipeRecord> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.status !== 'published' && recipe.authorUserId !== requestingUserId) {
    throw new ForbiddenError('Access denied')
  }
  return recipe
}

export const createRecipe = async (authorUserId: string, input: RecipeInput, now = Date.now): Promise<RecipeRecord> => {
  const ts = now()
  const record: RecipeRecord = {
    ...input,
    authorUserId,
    createdAt: ts,
    photos: input.photos ?? [],
    recipeId: generateId(),
    servings: input.servings ?? 2,
    status: 'draft',
    tags: input.tags ?? [],
    updatedAt: ts,
  }
  await data.putRecipe(record)
  return record
}

export const updateRecipe = async (
  recipeId: string,
  requestingUserId: string,
  input: Partial<RecipeInput>,
  now = Date.now,
): Promise<RecipeRecord> => {
  const existing = await data.getRecipe(recipeId)
  if (existing.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  const updated: RecipeRecord = { ...existing, ...input, recipeId, updatedAt: now() }
  await data.putRecipe(updated)
  return updated
}

export const deleteRecipe = async (recipeId: string, requestingUserId: string): Promise<void> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  await data.deleteRecipe(recipeId)
}
