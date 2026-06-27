# food-api: Recipe Book, Meal Planning & Shopping List — Design Spec

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Phase 1 of 2. Phase 2 (food tracking) is documented in the Future section below.

---

## Overview

A backend API for a personal recipe book and meal planner. Recipes are a public shared catalog. Users create meal plans and shopping lists, which they can share with other users (e.g. a spouse) with viewer or editor access. Shopping lists are generated from meal plans by aggregating and converting ingredient quantities across recipes. This API lives at `food-api.dbowland.com` (prod) and `food-api.bowland.link` (test), serving a separate `food-ui` frontend.

---

## Architecture

**Stack:** AWS SAM, TypeScript, Node.js 24, esbuild bundling, Lambda, DynamoDB (single-table), API Gateway HTTP API, Cognito User Pool, S3 (recipe photos).

**Auth:** Cognito User Pool with phone number as the sign-in alias and SMS OTP as the auth mechanism. Google OAuth dropped. Architecture leaves room for additional Cognito identity providers (Apple, email/password, etc.) without application code changes — just add a provider to the User Pool.

**Lambda organization (Option B — one function per resource type):** Each resource group is one Lambda function with internal routing on `httpMethod + path`. ~8 functions total vs 40+ in the per-verb-per-path pattern. esbuild tree-shaking keeps bundles small regardless.

**Domains:**

- Prod: `food-api.dbowland.com`
- Test: `food-api.bowland.link`
- CORS origins: `https://food.dbowland.com` (prod), `https://food.bowland.link` (test)

**Photo uploads:** Client requests a presigned S3 URL from the API, then uploads directly to S3. The API stores the resulting S3 key on the recipe record. No binary data flows through Lambda.

**Kept from choosee-api:** DynamoDB client, X-Ray logging, error utilities, ID generator, SMS service wrapper, all build/lint/test/deploy tooling, SAM template structure.

**Deleted from choosee-api:** All session/round/bracket/voting/choices handlers and services, Google Maps, reCAPTCHA, geocoding, adjectives/nouns/place-types assets, Google OAuth Cognito provider, all choosee-specific types.

---

## Data Model

### DynamoDB Single-Table Key Design

| Entity        | PK                          | SK                    |
| ------------- | --------------------------- | --------------------- |
| User profile  | `USER#{userId}`             | `PROFILE`             |
| User favorite | `USER#{userId}`             | `FAVORITE#{recipeId}` |
| Ingredient    | `INGREDIENT#{ingredientId}` | `METADATA`            |
| Recipe        | `RECIPE#{recipeId}`         | `METADATA`            |
| Meal plan     | `PLAN#{planId}`             | `METADATA`            |
| Shopping list | `LIST#{listId}`             | `METADATA`            |

**GSI:** `status-index` on recipes — PK=`status`, SK=`createdAt` — supports querying all published recipes without a scan.

---

### Entities

**Ingredient**

```ts
{
  ingredientId: string
  name: string
  allowedUnitTypes: ('volume' | 'weight' | 'count')[]
  // Reserved for Phase 2 (nutrition tracking) — not required in Phase 1:
  nutritionPer100g?: { calories: number; protein: number; carbs: number; fat: number }
}
```

**Recipe**

```ts
{
  recipeId: string
  title: string
  description: string
  servings: number           // default 2
  ingredients: { ingredientId: string; quantity: number; unit: string }[]
  steps: string[]
  tags: string[]
  photos: string[]           // S3 keys
  authorUserId: string
  status: 'draft' | 'pending' | 'published'
  createdAt: number          // epoch ms
  updatedAt: number
}
```

Recipes default to `draft` on creation. Status promotion (draft → pending → published) is a future admin/vetting workflow; endpoints for it are not built in Phase 1.

**User**

```ts
{
  userId: string // Cognito sub
  phone: string
  displayName: string
  createdAt: number
}
// Favorites stored as separate DynamoDB items (USER#x / FAVORITE#y)
// so they're queryable independently of the profile record.
```

**MealPlan**

```ts
{
  planId: string
  ownerUserId: string
  title: string
  items: {
    recipeId: string
    servings: number
  }
  ;[]
  shares: {
    userId: string
    role: 'viewer' | 'editor'
  }
  ;[]
  createdAt: number
  updatedAt: number
}
```

**ShoppingList**

```ts
{
  listId: string
  ownerUserId: string
  title: string
  generatedFromPlanId?: string
  items: {
    itemId: string
    ingredientId?: string    // linked ingredient, or...
    freeText?: string        // ...free-form text item
    quantity: number
    unit: string
    checkedBy?: string       // userId
    checkedAt?: number       // epoch ms
  }[]
  shares: { userId: string; role: 'viewer' | 'editor' }[]
  createdAt: number
  updatedAt: number
}
```

---

### Unit System

Hardcoded conversion table (not stored in DynamoDB — no runtime need to make this dynamic).

**Volume** (base: ml)
| Unit | ml |
|---|---|
| tsp | 4.93 |
| tbsp | 14.79 |
| fl oz | 29.57 |
| cup | 236.59 |
| pint | 473.18 |
| quart | 946.35 |
| gallon | 3785.41 |
| liter | 1000 |

**Weight** (base: g)
| Unit | g |
|---|---|
| mg | 0.001 |
| kg | 1000 |
| oz | 28.35 |
| lb | 453.59 |

**Count** (base: unit)
| Unit | units |
|---|---|
| dozen | 12 |
| score | 20 |
| gross | 144 |

Shopping list generation: convert all quantities to the base unit, sum by ingredient, then present in the most human-readable unit (e.g., 1893 ml → "2 quarts", 907 g → "2 lbs").

An ingredient's `allowedUnitTypes` constrains which units are valid when authoring a recipe. Cross-type conversion (e.g., cups to grams for flour) is out of scope for Phase 1.

---

## API Endpoints

All endpoints require Cognito JWT in `Authorization` header except where marked **public**.

### Ingredients — `IngredientsFunction`

| Method | Path                | Auth     | Notes                                      |
| ------ | ------------------- | -------- | ------------------------------------------ |
| GET    | `/ingredients`      | public   | List all ingredients                       |
| POST   | `/ingredients`      | required | Create ingredient (admin gate added later) |
| GET    | `/ingredients/{id}` | public   | Get single ingredient                      |
| PUT    | `/ingredients/{id}` | required | Update ingredient                          |

### Recipes — `RecipesFunction`

| Method | Path                | Auth        | Notes                                    |
| ------ | ------------------- | ----------- | ---------------------------------------- |
| GET    | `/recipes`          | public      | List published recipes                   |
| GET    | `/users/me/recipes` | required    | List own recipes (all statuses)          |
| POST   | `/recipes`          | required    | Create recipe (status=draft)             |
| GET    | `/recipes/{id}`     | conditional | Public if published; owner-only if draft |
| PUT    | `/recipes/{id}`     | required    | Update (owner only)                      |
| DELETE | `/recipes/{id}`     | required    | Delete (owner only)                      |

### Photos — `PhotosFunction`

| Method | Path      | Auth     | Notes                           |
| ------ | --------- | -------- | ------------------------------- |
| POST   | `/photos` | required | Returns presigned S3 upload URL |

### Users — `UsersFunction`

| Method | Path                             | Auth     | Notes                  |
| ------ | -------------------------------- | -------- | ---------------------- |
| GET    | `/users/me`                      | required | Get own profile        |
| PUT    | `/users/me`                      | required | Update display name    |
| GET    | `/users/me/favorites`            | required | List favorited recipes |
| PUT    | `/users/me/favorites/{recipeId}` | required | Add favorite           |
| DELETE | `/users/me/favorites/{recipeId}` | required | Remove favorite        |

### Meal Plans — `MealPlansFunction`

| Method | Path                               | Auth     | Notes                                   |
| ------ | ---------------------------------- | -------- | --------------------------------------- |
| GET    | `/meal-plans`                      | required | Plans owned by or shared with requester |
| POST   | `/meal-plans`                      | required | Create plan                             |
| GET    | `/meal-plans/{id}`                 | required | Owner or shared user                    |
| PUT    | `/meal-plans/{id}`                 | required | Owner or editor                         |
| DELETE | `/meal-plans/{id}`                 | required | Owner only                              |
| PUT    | `/meal-plans/{id}/shares/{userId}` | required | Add/update share                        |
| DELETE | `/meal-plans/{id}/shares/{userId}` | required | Remove share                            |

### Shopping Lists — `ShoppingListsFunction`

| Method | Path                                        | Auth     | Notes                                                                     |
| ------ | ------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| GET    | `/shopping-lists`                           | required | Lists owned by or shared with requester                                   |
| POST   | `/shopping-lists`                           | required | Create list; optionally pass `generatedFromPlanId` to auto-generate items |
| GET    | `/shopping-lists/{id}`                      | required | Owner or shared user                                                      |
| PUT    | `/shopping-lists/{id}`                      | required | Owner or editor                                                           |
| DELETE | `/shopping-lists/{id}`                      | required | Owner only                                                                |
| PUT    | `/shopping-lists/{id}/items/{itemId}/check` | required | Mark item picked up (any user with access)                                |
| DELETE | `/shopping-lists/{id}/items/{itemId}/check` | required | Uncheck item                                                              |
| PUT    | `/shopping-lists/{id}/shares/{userId}`      | required | Add/update share                                                          |
| DELETE | `/shopping-lists/{id}/shares/{userId}`      | required | Remove share                                                              |

---

## Sharing & Access Control

Shares are stored denormalized inside the plan/list document. On every mutating request the handler checks: is the requester the `ownerUserId`, or present in `shares` with the appropriate role?

- **Owner:** full access including share management and deletion
- **Editor:** can update items, check/uncheck shopping list items, cannot delete or manage shares
- **Viewer:** read-only

No separate permissions table needed at this scale.

---

## Directory Structure

```
src/
  handlers/             # Lambda entry points — one file per function
    ingredients.ts
    recipes.ts
    photos.ts
    users.ts
    meal-plans.ts
    shopping-lists.ts
  services/             # Business logic
    ingredients.ts
    recipes.ts
    photos.ts
    users.ts
    meal-plans.ts
    shopping-lists.ts
    shopping-list-generator.ts   # aggregation + unit conversion
    unit-converter.ts            # pure conversion functions
    sms.ts                       # kept for future share notifications
  data/                 # DynamoDB access layer — one file per entity
    dynamodb.ts         # shared DynamoDB client
    ingredients.ts
    recipes.ts
    users.ts
    meal-plans.ts
    shopping-lists.ts
  utils/
    auth.ts             # JWT validation (adapted from choosee)
    errors.ts
    id-generator.ts
    logging.ts
  types.ts
  config.ts
  errors.ts
```

Phase 2 tracking adds `handlers/food-logs.ts`, `services/nutrition.ts`, `services/food-recognizer.ts`, `data/food-logs.ts`, `data/restaurant-items.ts` — zero changes to the Phase 1 structure.

---

## Error Handling

- **400** — validation failure (AJV schema on all request bodies)
- **401** — missing or invalid JWT
- **403** — resource exists but requester lacks access
- **404** — resource not found
- **500** — unexpected errors

Structured JSON error body: `{ message: string }` on all error responses.

---

## Testing

**Rules:**

- Functionality only — no CSS, no presentation layer tests
- `beforeAll` to set shared mock state; `mockReturnValueOnce` for per-test deviations from the default
- No `if` statements, no live `Date.now()`, no live `Math.random()` in test code
- No date arithmetic in test setup that depends on when the test runs

**Dependency injection for non-determinism:** Any service or utility that needs the current time or randomness accepts it as an optional parameter defaulting to the real implementation:

```ts
// Source
export const createRecipe = (input: RecipeInput, now = Date.now): Recipe => ({
  ...input,
  createdAt: now(),
  updatedAt: now(),
})

// Test — no jest.spyOn, no restoreAllMocks, fully deterministic
it('sets createdAt', () => {
  const result = createRecipe(input, () => 1_000_000)
  expect(result.createdAt).toBe(1_000_000)
})
```

**Structure:** Data layer (`src/data/`) is mocked via `jest.mock`. Business logic in `src/services/` is unit tested against those mocks. Pure functions (`unit-converter.ts`, `shopping-list-generator.ts`) are tested with direct inputs and outputs.

---

## Future: Phase 2 — Food Tracking System

_Captured here as a starting point. Not in scope for Phase 1._

### Core idea

Users log what they eat — servings of a recipe, a specific restaurant item, or free-form custom entry. The app tracks calories and macros over time. Eventually: upload a photo, AI identifies and quantifies what's in it.

### Entities (Phase 2)

**FoodLog entry**

```ts
{
  logId: string
  userId: string
  loggedAt: number          // epoch ms — the meal time, user-specified
  entries: (
    | { type: 'recipe';     recipeId: string; servings: number }
    | { type: 'restaurant'; restaurantItemId: string; quantity: number; unit: string; overrides?: string[] }
    | { type: 'custom';     description: string; calories: number; protein?: number; carbs?: number; fat?: number }
  )[]
}
```

**RestaurantItem** — a public catalog (like recipes but for restaurant/packaged foods)

```ts
{
  restaurantItemId: string
  brand: string // e.g. "Taco Bell"
  name: string // e.g. "Soft Taco"
  servingSize: number
  servingUnit: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  source: 'manual' | 'usda' | 'ai'
}
```

### Nutrition flow

- Ingredient gains `nutritionPer100g` (stub already reserved in Phase 1 schema)
- Recipe nutrition per serving = sum of (ingredient quantity × nutrition density) ÷ servings
- FoodLog entry nutrition = sum across all log entries for the day

### Photo-based logging

1. User uploads a photo
2. AI (Claude vision or similar) classifies food items and estimates quantities
3. API returns a proposed log entry for user confirmation
4. User confirms/edits → saved as a FoodLog

### New Lambda functions (Phase 2)

- `FoodLogsFunction` — `/food-logs` CRUD
- `NutritionFunction` — `/nutrition` computed summaries (daily totals, weekly trends)
- `RestaurantItemsFunction` — `/restaurant-items` catalog

### Restaurant item vetting

Same pattern as recipe vetting — manual or AI-assisted approval before an item is public.

### Phase 1 → Phase 2 contract

The only Phase 1 artifact Phase 2 depends on is the `ingredientId` reference and the `nutritionPer100g` stub field. Filling that field in is the only Phase 1 change needed to unlock nutrition tracking for recipes.
