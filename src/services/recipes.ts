import * as data from '../data/recipes'
import { ForbiddenError } from '../errors'
import { buildPhotoUrl } from '../services/photos'
import { RecipeIngredient, RecipeRecord, RecipeStatus } from '../types'
import { generateId } from '../utils/id-generator'

const withPhotoUrls = (record: RecipeRecord): RecipeRecord => ({
  ...record,
  photos: record.photos.map(buildPhotoUrl),
})

interface RecipeInput {
  title: string
  description: string
  servings?: number
  ingredients: RecipeIngredient[]
  steps: string[]
  tags?: string[]
  photos?: string[]
}

interface RecipeUpdateInput {
  title?: string
  description?: string
  servings?: number
  ingredients?: RecipeIngredient[]
  steps?: string[]
  tags?: string[]
  photos?: string[]
  status?: RecipeStatus
}

export const listPublishedRecipes = async (): Promise<RecipeRecord[]> =>
  (await data.listPublishedRecipes()).map(withPhotoUrls)

export const listMyRecipes = async (userId: string): Promise<RecipeRecord[]> =>
  (await data.listRecipesByAuthor(userId)).map(withPhotoUrls)

export const getRecipe = async (recipeId: string, requestingUserId?: string): Promise<RecipeRecord> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.status !== 'published' && recipe.authorUserId !== requestingUserId) {
    throw new ForbiddenError('Access denied')
  }
  return withPhotoUrls(recipe)
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
  return withPhotoUrls(record)
}

export const updateRecipe = async (
  recipeId: string,
  requestingUserId: string,
  input: RecipeUpdateInput,
  now = Date.now,
): Promise<RecipeRecord> => {
  const existing = await data.getRecipe(recipeId)
  if (existing.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  const updated: RecipeRecord = {
    ...existing,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    servings: input.servings ?? existing.servings,
    ingredients: input.ingredients ?? existing.ingredients,
    steps: input.steps ?? existing.steps,
    tags: input.tags ?? existing.tags,
    photos: input.photos ?? existing.photos,
    status: input.status ?? existing.status,
    updatedAt: now(),
  }
  await data.putRecipe(updated)
  return withPhotoUrls(updated)
}

export const deleteRecipe = async (recipeId: string, requestingUserId: string): Promise<void> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  await data.deleteRecipe(recipeId)
}
