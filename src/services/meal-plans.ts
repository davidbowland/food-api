import * as data from '../data/meal-plans'
import { ForbiddenError } from '../errors'
import { MealPlanItem, MealPlanRecord, ShareRole } from '../types'
import { generateId } from '../utils/id-generator'

interface MealPlanInput {
  title?: string
  items?: MealPlanItem[]
}

const canAccess = (plan: MealPlanRecord, userId: string): boolean =>
  plan.ownerUserId === userId || plan.shares.some((s) => s.userId === userId)

const canEdit = (plan: MealPlanRecord, userId: string): boolean =>
  plan.ownerUserId === userId || plan.shares.some((s) => s.userId === userId && s.role === 'editor')

export const listMyMealPlans = async (userId: string): Promise<MealPlanRecord[]> => {
  const [owned, sharedIds] = await Promise.all([data.listMealPlansByOwner(userId), data.listSharedPlanIds(userId)])
  const shared = await Promise.all(sharedIds.map((id) => data.getMealPlan(id)))
  const ownedIds = new Set(owned.map((p) => p.planId))
  return [...owned, ...shared.filter((p) => !ownedIds.has(p.planId))]
}

export const getMealPlan = async (planId: string, userId: string): Promise<MealPlanRecord> => {
  const plan = await data.getMealPlan(planId)
  if (!canAccess(plan, userId)) throw new ForbiddenError('Access denied')
  return plan
}

export const createMealPlan = async (
  ownerUserId: string,
  input: MealPlanInput,
  now = Date.now,
): Promise<MealPlanRecord> => {
  const ts = now()
  const plan: MealPlanRecord = {
    createdAt: ts,
    items: input.items ?? [],
    ownerUserId,
    planId: generateId(),
    shares: [],
    title: input.title ?? '',
    updatedAt: ts,
  }
  await data.putMealPlan(plan)
  return plan
}

export const updateMealPlan = async (
  planId: string,
  userId: string,
  input: MealPlanInput,
  now = Date.now,
): Promise<MealPlanRecord> => {
  const plan = await data.getMealPlan(planId)
  if (!canEdit(plan, userId)) throw new ForbiddenError('Access denied')
  const updated: MealPlanRecord = {
    ...plan,
    title: input.title ?? plan.title,
    items: input.items ?? plan.items,
    updatedAt: now(),
  }
  await data.putMealPlan(updated)
  return updated
}

export const deleteMealPlan = async (planId: string, userId: string): Promise<void> => {
  const plan = await data.getMealPlan(planId)
  if (plan.ownerUserId !== userId) throw new ForbiddenError('Access denied')
  await data.deleteMealPlan(planId)
}

export const upsertShare = async (
  planId: string,
  ownerId: string,
  targetUserId: string,
  role: ShareRole,
): Promise<MealPlanRecord> => {
  const plan = await data.getMealPlan(planId)
  if (plan.ownerUserId !== ownerId) throw new ForbiddenError('Access denied')
  const shares = plan.shares.filter((s) => s.userId !== targetUserId)
  shares.push({ userId: targetUserId, role })
  const updated: MealPlanRecord = { ...plan, shares }
  await Promise.all([data.putMealPlan(updated), data.putSharedPlanIndex(targetUserId, planId)])
  return updated
}

export const removeShare = async (planId: string, ownerId: string, targetUserId: string): Promise<MealPlanRecord> => {
  const plan = await data.getMealPlan(planId)
  if (plan.ownerUserId !== ownerId) throw new ForbiddenError('Access denied')
  const updated: MealPlanRecord = { ...plan, shares: plan.shares.filter((s) => s.userId !== targetUserId) }
  await Promise.all([data.putMealPlan(updated), data.deleteSharedPlanIndex(targetUserId, planId)])
  return updated
}
