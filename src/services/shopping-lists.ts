import * as ingredientData from '../data/ingredients'
import * as mealPlanData from '../data/meal-plans'
import * as recipeData from '../data/recipes'
import * as data from '../data/shopping-lists'
import { ForbiddenError, NotFoundError } from '../errors'
import { ShoppingListItem, ShoppingListRecord, ShareRole } from '../types'
import { generateId } from '../utils/id-generator'
import { generateShoppingListItems } from './shopping-list-generator'

interface ShoppingListInput {
  title?: string
  generatedFromPlanId?: string
  items?: Omit<ShoppingListItem, 'itemId' | 'checkedBy' | 'checkedAt'>[]
}

const canAccess = (list: ShoppingListRecord, userId: string): boolean =>
  list.ownerUserId === userId || list.shares.some((s) => s.userId === userId)

const canEdit = (list: ShoppingListRecord, userId: string): boolean =>
  list.ownerUserId === userId || list.shares.some((s) => s.userId === userId && s.role === 'editor')

export const listMyShoppingLists = async (userId: string): Promise<ShoppingListRecord[]> => {
  const [owned, sharedIds] = await Promise.all([data.listShoppingListsByOwner(userId), data.listSharedListIds(userId)])
  const shared = await Promise.all(sharedIds.map((id) => data.getShoppingList(id)))
  const ownedIds = new Set(owned.map((l) => l.listId))
  return [...owned, ...shared.filter((l) => !ownedIds.has(l.listId))]
}

export const getShoppingList = async (listId: string, userId: string): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (!canAccess(list, userId)) throw new ForbiddenError('Access denied')
  return list
}

export const createShoppingList = async (
  ownerUserId: string,
  input: ShoppingListInput,
  now = Date.now,
): Promise<ShoppingListRecord> => {
  const ts = now()
  let items: ShoppingListItem[] = (input.items ?? []).map((i) => ({ ...i, itemId: generateId() }))

  if (input.generatedFromPlanId) {
    const plan = await mealPlanData.getMealPlan(input.generatedFromPlanId)
    const recipeIds = [...new Set(plan.items.map((i) => i.recipeId))]
    const [recipes, allIngredients] = await Promise.all([
      Promise.all(recipeIds.map((id) => recipeData.getRecipe(id))),
      ingredientData.listIngredients(),
    ])
    const recipeMap = new Map(recipes.map((r) => [r.recipeId, r]))
    const ingredientMap = new Map(allIngredients.map((i) => [i.ingredientId, i]))
    items = generateShoppingListItems(plan, recipeMap, ingredientMap)
  }

  const list: ShoppingListRecord = {
    createdAt: ts,
    generatedFromPlanId: input.generatedFromPlanId,
    items,
    listId: generateId(),
    ownerUserId,
    shares: [],
    title: input.title ?? '',
    updatedAt: ts,
  }
  await data.putShoppingList(list)
  return list
}

export const updateShoppingList = async (
  listId: string,
  userId: string,
  input: ShoppingListInput,
  now = Date.now,
): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (!canEdit(list, userId)) throw new ForbiddenError('Access denied')
  const updated: ShoppingListRecord = {
    ...list,
    title: input.title ?? list.title,
    items: (input.items as ShoppingListItem[] | undefined) ?? list.items,
    updatedAt: now(),
  }
  await data.putShoppingList(updated)
  return updated
}

export const deleteShoppingList = async (listId: string, userId: string): Promise<void> => {
  const list = await data.getShoppingList(listId)
  if (list.ownerUserId !== userId) throw new ForbiddenError('Access denied')
  await data.deleteShoppingList(listId)
}

export const checkItem = async (
  listId: string,
  itemId: string,
  userId: string,
  now = Date.now,
): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (!canAccess(list, userId)) throw new ForbiddenError('Access denied')
  const item = list.items.find((i) => i.itemId === itemId)
  if (!item) throw new NotFoundError('Item not found')
  item.checkedBy = userId
  item.checkedAt = now()
  await data.putShoppingList(list)
  return list
}

export const uncheckItem = async (listId: string, itemId: string, userId: string): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (!canAccess(list, userId)) throw new ForbiddenError('Access denied')
  const item = list.items.find((i) => i.itemId === itemId)
  if (!item) throw new NotFoundError('Item not found')
  delete item.checkedBy
  delete item.checkedAt
  await data.putShoppingList(list)
  return list
}

export const upsertShare = async (
  listId: string,
  ownerId: string,
  targetUserId: string,
  role: ShareRole,
): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (list.ownerUserId !== ownerId) throw new ForbiddenError('Access denied')
  const shares = [...list.shares.filter((s) => s.userId !== targetUserId), { userId: targetUserId, role }]
  const updated: ShoppingListRecord = { ...list, shares }
  await Promise.all([data.putShoppingList(updated), data.putSharedListIndex(targetUserId, listId)])
  return updated
}

export const removeShare = async (
  listId: string,
  ownerId: string,
  targetUserId: string,
): Promise<ShoppingListRecord> => {
  const list = await data.getShoppingList(listId)
  if (list.ownerUserId !== ownerId) throw new ForbiddenError('Access denied')
  const updated: ShoppingListRecord = { ...list, shares: list.shares.filter((s) => s.userId !== targetUserId) }
  await Promise.all([data.putShoppingList(updated), data.deleteSharedListIndex(targetUserId, listId)])
  return updated
}
