export { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

export type UnitType = 'volume' | 'weight' | 'count'
export type RecipeStatus = 'draft' | 'pending' | 'published'
export type ShareRole = 'viewer' | 'editor'

export interface AuthContext {
  isAuthenticated: boolean
  userId: string | null
  phone?: string
  displayName?: string
}

export interface Share {
  userId: string
  role: ShareRole
}

export interface IngredientRecord {
  ingredientId: string
  name: string
  allowedUnitTypes: UnitType[]
  nutritionPer100g?: { calories: number; protein: number; carbs: number; fat: number }
  createdAt: number
  updatedAt: number
}

export interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: string
}

export interface RecipeRecord {
  recipeId: string
  title: string
  description: string
  servings: number
  ingredients: RecipeIngredient[]
  steps: string[]
  tags: string[]
  photos: string[]
  authorUserId: string
  status: RecipeStatus
  createdAt: number
  updatedAt: number
}

export interface UserRecord {
  userId: string
  phone: string
  displayName: string
  createdAt: number
}

export interface MealPlanItem {
  recipeId: string
  servings: number
}

export interface MealPlanRecord {
  planId: string
  ownerUserId: string
  title: string
  items: MealPlanItem[]
  shares: Share[]
  createdAt: number
  updatedAt: number
}

export interface ShoppingListItem {
  itemId: string
  ingredientId?: string
  freeText?: string
  quantity: number
  unit: string
  checkedBy?: string
  checkedAt?: number
}

export interface ShoppingListRecord {
  listId: string
  ownerUserId: string
  title: string
  generatedFromPlanId?: string
  items: ShoppingListItem[]
  shares: Share[]
  createdAt: number
  updatedAt: number
}

export type MessageType = 'PROMOTIONAL' | 'TRANSACTIONAL'

export interface SMSMessage {
  to: string
  contents: string
  messageType?: MessageType
}
