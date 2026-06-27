import * as data from '../data/ingredients'
import { IngredientRecord, UnitType } from '../types'
import { generateId } from '../utils/id-generator'

interface IngredientInput {
  name: string
  allowedUnitTypes: UnitType[]
  nutritionPer100g?: { calories: number; protein: number; carbs: number; fat: number }
}

export const listIngredients = (): Promise<IngredientRecord[]> => data.listIngredients()

export const getIngredient = (ingredientId: string): Promise<IngredientRecord> => data.getIngredient(ingredientId)

export const createIngredient = async (input: IngredientInput, now = Date.now): Promise<IngredientRecord> => {
  const ts = now()
  const record: IngredientRecord = {
    ...input,
    ingredientId: generateId(),
    createdAt: ts,
    updatedAt: ts,
  }
  await data.putIngredient(record)
  return record
}

export const updateIngredient = async (
  ingredientId: string,
  input: Partial<IngredientInput>,
  now = Date.now,
): Promise<IngredientRecord> => {
  const existing = await data.getIngredient(ingredientId)
  const updated: IngredientRecord = { ...existing, ...input, ingredientId, updatedAt: now() }
  await data.putIngredient(updated)
  return updated
}
