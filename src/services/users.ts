import * as data from '../data/users'
import { NotFoundError } from '../errors'
import { UserRecord } from '../types'

interface UserUpdateInput {
  displayName?: string
}

export const getOrCreateUser = async (userId: string, phone: string, now = Date.now): Promise<UserRecord> => {
  try {
    return await data.getUser(userId)
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
    const user: UserRecord = { userId, phone, displayName: '', createdAt: now() }
    await data.putUser(user)
    return user
  }
}

export const updateUser = async (userId: string, input: UserUpdateInput): Promise<UserRecord> => {
  const existing = await data.getUser(userId)
  const updated: UserRecord = {
    ...existing,
    displayName: input.displayName ?? existing.displayName,
  }
  await data.putUser(updated)
  return updated
}

export const listFavorites = (userId: string): Promise<string[]> => data.listFavorites(userId)

export const addFavorite = (userId: string, recipeId: string): Promise<void> => data.addFavorite(userId, recipeId)

export const removeFavorite = (userId: string, recipeId: string): Promise<void> => data.removeFavorite(userId, recipeId)
