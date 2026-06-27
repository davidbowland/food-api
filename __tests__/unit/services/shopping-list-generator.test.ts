import { generateShoppingListItems } from '@services/shopping-list-generator'
import { MealPlanRecord, RecipeRecord, IngredientRecord } from '@types'

const flour: IngredientRecord = {
  ingredientId: 'flour',
  name: 'Flour',
  allowedUnitTypes: ['volume', 'weight'],
  createdAt: 1,
  updatedAt: 1,
}
const eggs: IngredientRecord = {
  ingredientId: 'eggs',
  name: 'Eggs',
  allowedUnitTypes: ['count'],
  createdAt: 1,
  updatedAt: 1,
}

const pancakeRecipe: RecipeRecord = {
  recipeId: 'rec-pancake',
  title: 'Pancakes',
  description: '',
  servings: 2,
  ingredients: [
    { ingredientId: 'flour', quantity: 1, unit: 'cup' },
    { ingredientId: 'eggs', quantity: 2, unit: 'unit' },
  ],
  steps: [],
  tags: [],
  photos: [],
  authorUserId: 'u-1',
  status: 'published',
  createdAt: 1,
  updatedAt: 1,
}

const waffleRecipe: RecipeRecord = {
  recipeId: 'rec-waffle',
  title: 'Waffles',
  description: '',
  servings: 4,
  ingredients: [
    { ingredientId: 'flour', quantity: 2, unit: 'cup' },
    { ingredientId: 'eggs', quantity: 4, unit: 'unit' },
  ],
  steps: [],
  tags: [],
  photos: [],
  authorUserId: 'u-1',
  status: 'published',
  createdAt: 1,
  updatedAt: 1,
}

const plan: MealPlanRecord = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Breakfast Week',
  items: [
    { recipeId: 'rec-pancake', servings: 2 }, // full recipe
    { recipeId: 'rec-waffle', servings: 2 }, // half recipe (4 servings → 2)
  ],
  shares: [],
  createdAt: 1,
  updatedAt: 1,
}

describe('generateShoppingListItems', () => {
  const recipes = new Map([
    ['rec-pancake', pancakeRecipe],
    ['rec-waffle', waffleRecipe],
  ])
  const ingredientMap = new Map([
    ['flour', flour],
    ['eggs', eggs],
  ])

  it('aggregates flour from two recipes with scaling', () => {
    const items = generateShoppingListItems(plan, recipes, ingredientMap)
    const flourItem = items.find((i) => i.ingredientId === 'flour')
    expect(flourItem).toBeDefined()
    // pancakes: 1 cup (full) + waffles: 2 cup * (2/4) = 1 cup → total 2 cups
    expect(flourItem?.quantity).toBeCloseTo(2)
    expect(flourItem?.unit).toBe('cup')
  })

  it('aggregates eggs with scaling', () => {
    const items = generateShoppingListItems(plan, recipes, ingredientMap)
    const eggItem = items.find((i) => i.ingredientId === 'eggs')
    expect(eggItem).toBeDefined()
    // pancakes: 2 eggs (full) + waffles: 4 * (2/4) = 2 eggs → total 4 eggs
    expect(eggItem?.quantity).toBe(4)
    expect(eggItem?.unit).toBe('unit')
  })

  it('returns one item per unique ingredient', () => {
    const items = generateShoppingListItems(plan, recipes, ingredientMap)
    const ingredientIds = items.map((i) => i.ingredientId)
    expect(new Set(ingredientIds).size).toBe(ingredientIds.length)
  })

  it('assigns a unique itemId to each item', () => {
    const items = generateShoppingListItems(plan, recipes, ingredientMap)
    const ids = items.map((i) => i.itemId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('skips recipes not present in the recipe map', () => {
    const partialRecipes = new Map([['rec-pancake', pancakeRecipe]])
    const items = generateShoppingListItems(plan, partialRecipes, ingredientMap)
    // only pancake ingredients, but eggs count = 2 (only pancakes)
    const eggItem = items.find((i) => i.ingredientId === 'eggs')
    expect(eggItem?.quantity).toBe(2)
  })
})
