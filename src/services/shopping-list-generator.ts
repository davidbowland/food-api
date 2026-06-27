import { IngredientRecord, MealPlanRecord, RecipeRecord, ShoppingListItem } from '../types'
import { convertToBase, getUnitType } from './unit-converter'

export const generateShoppingListItems = (
  plan: MealPlanRecord,
  recipes: Map<string, RecipeRecord>,
  ingredients: Map<string, IngredientRecord>,
): ShoppingListItem[] => {
  const baseTotals = new Map<string, number>()
  const preferredUnit = new Map<string, string>()

  for (const { recipeId, servings: desiredServings } of plan.items) {
    const recipe = recipes.get(recipeId)
    if (!recipe) continue
    const scale = desiredServings / recipe.servings

    for (const { ingredientId, quantity, unit } of recipe.ingredients) {
      let base: number
      try {
        base = convertToBase(quantity * scale, unit)
      } catch {
        // unknown unit — fall back to raw quantity so we still aggregate
        base = quantity * scale
      }
      baseTotals.set(ingredientId, (baseTotals.get(ingredientId) ?? 0) + base)

      if (!preferredUnit.has(ingredientId)) {
        try {
          // only record known units as preferred; getUnitType validates the unit
          getUnitType(unit)
          preferredUnit.set(ingredientId, unit)
        } catch {
          /* unknown unit, skip */
        }
      }
    }
  }

  return Array.from(baseTotals.entries()).map(([ingredientId, baseAmount]) => {
    const ingredient = ingredients.get(ingredientId)
    const outUnit = preferredUnit.get(ingredientId) ?? 'unit'
    let quantity: number
    try {
      const factor = convertToBase(1, outUnit)
      quantity = Math.round((baseAmount / factor) * 100) / 100
    } catch {
      quantity = baseAmount
    }

    return {
      ingredientId,
      itemId: crypto.randomUUID(),
      quantity,
      unit: outUnit,
      ...(ingredient ? {} : { freeText: ingredientId }),
    }
  })
}
