# Frontend Implementation Notes

The backend controls what is displayed. The frontend's job is to render it.
Do not derive state or build logic that reimplements what the API already
enforces — trust the response and render it.

Base URLs:

- Production: `https://food-api.dbowland.com/v1`
- Staging: `https://food-api.bowland.link/v1`

---

## Authentication

Auth is handled via Cognito's CUSTOM_AUTH (phone + OTP) flow using the
**AWS Amplify SDK** or **`amazon-cognito-identity-js`** directly. There is no
REST endpoint for auth — it goes through Cognito's hosted UI or SDK.

```
1. User enters phone number (E.164 format: +15551234567)
2. Initiate auth: Cognito sends OTP via SMS
3. User enters 6-digit OTP
4. On success, Cognito returns: AccessToken, IdToken, RefreshToken
```

The **IdToken** is what the API expects. Pass it as:

```
Authorization: Bearer <IdToken>
```

Store tokens in memory (not localStorage) to avoid XSS exposure. Use the
refresh token to silently renew the IdToken before it expires (1 hour default).

When the API returns `401`, the token has expired or is invalid — trigger a
re-auth flow. When it returns `403`, the user is authenticated but does not
have access to that specific resource — show a "not authorized" message, do
not re-auth.

---

## User Profile

### Boot sequence

On first load after auth, call `GET /users/me`. The backend creates the user
record on first call if it does not exist (phone number comes from the JWT).
Use the returned `UserRecord` as the session identity — do not derive the
user's display name or userId from the JWT directly.

```
GET /users/me
→ { userId, phone, displayName, createdAt }
```

`displayName` defaults to the phone number until the user sets one. Show the
onboarding prompt to set a display name if `displayName === phone`.

### Updating display name

```
PUT /users/me
Body: { "displayName": "Alice" }
→ { userId, phone, displayName, createdAt }
```

Only `displayName` can be changed. Do not send other fields.

---

## User Lookup

Used to resolve a phone number to a userId before sharing a meal plan or shopping list.

```
GET /users/lookup?phone=%2B15551234567
→ { userId: string, displayName: string }
```

`phone` must be URL-encoded E.164 format (e.g. `+15551234567` → `%2B15551234567`).

Returns 400 if `phone` is missing or not valid E.164. Returns 404 if no account exists with that phone number.

The returned `displayName` defaults to the phone number if the user has not set one.

---

## Ingredients

The ingredient catalog is shared and global — not per-user.

### Listing / searching (public — no auth required)

```
GET /ingredients
→ IngredientRecord[]
```

The API returns the full catalog. Filter and search client-side from this
list. Cache aggressively — the catalog changes rarely.

```
GET /ingredients/{ingredientId}
→ IngredientRecord
```

```ts
interface IngredientRecord {
  ingredientId: string
  name: string
  allowedUnitTypes: ('volume' | 'weight' | 'count')[]
  nutritionPer100g?: { calories: number; protein: number; carbs: number; fat: number }
  createdAt: number
  updatedAt: number
}
```

### Unit constraints

`allowedUnitTypes` tells the UI which unit pickers to offer for this
ingredient. Do not show volume units for an ingredient that only allows
`weight` — the backend will not reject it, but shopping list aggregation will
produce garbage. Enforce this in the UI.

---

## Recipes

### Public browsing (no auth required)

```
GET /recipes
→ RecipeRecord[]
```

Returns only `status: 'published'` recipes. Do not filter client-side — the
API already does it.

```
GET /recipes/{recipeId}
→ RecipeRecord
```

If the recipe is a `draft` and the caller is not the author, returns `403`.
Handle gracefully (show "recipe not found").

### Recipe data shape

```ts
interface RecipeRecord {
  recipeId: string
  title: string
  description: string
  servings: number // default 2
  ingredients: RecipeIngredient[]
  steps: string[]
  tags: string[]
  photos: string[] // S3 keys — see Photos section for how to display
  authorUserId: string
  status: 'draft' | 'pending' | 'published'
  createdAt: number
  updatedAt: number
}

interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: string
}
```

To display an ingredient line, look up `ingredientId` in the local ingredient
cache (`GET /ingredients`) to get the name. Always resolve from the catalog —
never store ingredient names on the recipe.

### My recipes (authenticated)

```
GET /users/me/recipes
→ RecipeRecord[]
```

Returns all recipes authored by the current user in any status (draft,
pending, published). Use this for the "my recipes" view, not `GET /recipes`.

### Creating a recipe

```
POST /recipes
Body: {
  title: string,
  description: string,
  servings?: number,        // defaults to 2
  ingredients: RecipeIngredient[],
  steps: string[],
  tags?: string[],
  photos?: string[]         // S3 keys; upload photos first (see Photos)
}
→ RecipeRecord (status: 'draft')
```

New recipes are always created as `draft`. The author can publish them via
`PUT /recipes/{id}` with `{ "status": "published" }`.

### Updating a recipe

```
PUT /recipes/{recipeId}
Body: Partial<RecipeUpdateInput>
→ RecipeRecord
```

Only the recipe author can update. Allowed fields:
`title`, `description`, `servings`, `ingredients`, `steps`, `tags`, `photos`, `status`

Send only the fields you want to change — the API merges with existing values.
The author controls publication: they can set `status` to `pending` or
`published` directly.

### Status lifecycle

```
draft → pending → published
```

Authors can move their recipe to any status via `PUT /recipes/{id}` with a
`status` field. Show the current status prominently in the author's editing
view. Published recipes are visible to all users.

---

## Photos

Photos are uploaded directly to S3 via a presigned URL. The backend generates
the URL; the frontend does the upload.

### Upload flow

```
1. POST /photos
   → { uploadUrl: string, key: string }

2. PUT {uploadUrl}
   Body: <binary image data>
   Content-Type: image/jpeg (or image/png, etc.)
   (This request goes directly to S3, not to the API)

3. Store the returned `key` on the recipe:
   PUT /recipes/{recipeId}
   Body: { photos: [...existingKeys, key] }
```

The presigned URL expires in 1 hour. Do not cache it — request a new one each
time the user initiates an upload.

### Displaying photos

There is no presigned-GET endpoint in the current implementation. Photo
display is expected to be handled by a CloudFront distribution in front of
the S3 bucket. The `key` values stored on a recipe (e.g. `photos/uuid`) map
directly to paths on that distribution.

Construct photo URLs as: `https://<cdn-domain>/{key}`

The CDN domain will be configured separately. Do not attempt to construct
S3 direct URLs.

---

## Meal Plans

Meal plans belong to a household, not just one user. The `shares` array
controls who else can see or edit a plan.

### Listing

```
GET /meal-plans
→ MealPlanRecord[]
```

Returns all plans the current user owns OR is a member of (via `shares`).
The FE does not need to separately fetch shared plans — the API merges both.

### Data shape

```ts
interface MealPlanRecord {
  planId: string
  ownerUserId: string
  title: string
  items: MealPlanItem[]
  shares: Share[]
  createdAt: number
  updatedAt: number
}

interface MealPlanItem {
  recipeId: string
  servings: number
}

interface Share {
  userId: string
  role: 'viewer' | 'editor'
}
```

### Access model

The `ownerUserId` field and the `shares` array together define who can do what:

| Action           | Owner | Editor | Viewer |
| ---------------- | ----- | ------ | ------ |
| View plan        | ✅    | ✅     | ✅     |
| Edit title/items | ✅    | ✅     | ❌     |
| Delete plan      | ✅    | ❌     | ❌     |
| Manage shares    | ✅    | ❌     | ❌     |

Do not derive permissions from the response data client-side. Make the API
call and let the backend return `403` if the user lacks permission. Show the
`403` as "you don't have permission to do this" — do not hide buttons based
on your own role inference (the server is the authority).

### Creating / updating

```
POST /meal-plans
Body: { title: string, items: MealPlanItem[] }
→ MealPlanRecord

PUT /meal-plans/{planId}
Body: { title?: string, items?: MealPlanItem[] }
→ MealPlanRecord
```

Only `title` and `items` can be set via update. Attempting to change
`ownerUserId` or `shares` via the PUT body is silently ignored — use the
dedicated share endpoints.

### Sharing

```
PUT /meal-plans/{planId}/shares/{userId}
Body: { "role": "editor" | "viewer" }
→ MealPlanRecord

DELETE /meal-plans/{planId}/shares/{userId}
→ MealPlanRecord
```

Only the owner can manage shares. The `userId` in the path is the Cognito
`sub` of the person to share with. The FE will need a way for users to look
up or enter the other person's userId (or phone number translated to userId).

---

## Shopping Lists

Shopping lists work like meal plans (same access model) with one additional
feature: items can be checked off, and each check records who checked it.

### Generating from a meal plan

```
POST /shopping-lists
Body: { title: string, generatedFromPlanId: string }
→ ShoppingListRecord
```

The backend fetches the plan, fetches all referenced recipes, fetches all
referenced ingredients, scales quantities to the requested servings, aggregates
by ingredient (combining quantities across recipes), and converts to smart
units. The FE sends one request and receives a fully populated list.

### Manual lists

```
POST /shopping-lists
Body: { title: string }
→ ShoppingListRecord (items: [])
```

Then add items via `PUT /shopping-lists/{id}` with the `items` array.

### Data shape

```ts
interface ShoppingListRecord {
  listId: string
  ownerUserId: string
  title: string
  generatedFromPlanId?: string
  items: ShoppingListItem[]
  shares: Share[]
  createdAt: number
  updatedAt: number
}

interface ShoppingListItem {
  itemId: string
  ingredientId?: string // present for catalog-linked items
  freeText?: string // present for free-text items
  quantity: number
  unit: string
  checkedBy?: string // userId of who checked it
  checkedAt?: number // epoch ms
}
```

An item has either `ingredientId` (linked to the catalog) or `freeText` (a
user-typed string like "Paper towels") but not both. Render them accordingly:
catalog items can show the ingredient name via lookup; free-text items show
the string directly.

### Checking items

Any user with access to the list (owner, editor, or viewer) can check and
uncheck items.

```
PUT  /shopping-lists/{listId}/items/{itemId}/check
→ ShoppingListRecord

DELETE /shopping-lists/{listId}/items/{itemId}/check
→ ShoppingListRecord
```

Both endpoints return the full updated list. Replace the local list state
with the response — do not optimistically toggle the checkbox and reconcile
later. The response is authoritative.

### Access model

| Action              | Owner | Editor | Viewer |
| ------------------- | ----- | ------ | ------ |
| View list           | ✅    | ✅     | ✅     |
| Check/uncheck items | ✅    | ✅     | ✅     |
| Edit title/items    | ✅    | ✅     | ❌     |
| Delete list         | ✅    | ❌     | ❌     |
| Manage shares       | ✅    | ❌     | ❌     |

Sharing follows the same pattern as meal plans but roles for shopping lists
default to `"viewer"`. Use `"viewer"` unless the user explicitly chooses
editor access.

---

## Favorites

Favorites are a per-user list of recipe IDs. They are not recipes — they are
pointers.

```
GET /users/me/favorites
→ string[]    (array of recipeIds)
```

To display a favorites list, fetch the recipe IDs, then load each recipe with
`GET /recipes/{recipeId}`. Batch these requests in parallel — do not fetch
them sequentially.

```
PUT    /users/me/favorites/{recipeId}   → 204 No Content
DELETE /users/me/favorites/{recipeId}  → 204 No Content
```

---

## Error handling

All errors follow this shape:

```ts
{
  message: string
}
```

| Status | Meaning                         | FE action                                    |
| ------ | ------------------------------- | -------------------------------------------- |
| 400    | Bad request (malformed body)    | Show validation error                        |
| 401    | Not authenticated               | Trigger re-auth                              |
| 403    | Authenticated but access denied | "You don't have permission" — do not re-auth |
| 404    | Resource not found              | "Not found" state                            |
| 500    | Server error                    | Generic error message + retry option         |

---

## What the FE must not do

- **Do not re-implement authorization logic.** The backend enforces all access
  rules. Hiding UI elements based on inferred role is fine for UX, but do not
  treat it as a security gate — the API will return `403` if the user tries
  something they cannot do.

- **Do not store user identity from the JWT.** Use `GET /users/me` and trust
  the response. The JWT `sub` is the `userId`, but use the `UserRecord` for
  anything displayed to the user.

- **Do not filter recipe lists.** `GET /recipes` returns published recipes
  only. `GET /users/me/recipes` returns everything the user owns. Do not
  apply additional status filters — the BE controls what is visible.

- **Do not construct S3 URLs directly.** Use the CDN domain for photo display
  and the presigned URL (from `POST /photos`) for upload. S3 bucket URLs are
  not exposed.

- **Do not aggregate ingredients client-side.** When generating a shopping
  list from a meal plan, call `POST /shopping-lists` with `generatedFromPlanId`
  and let the backend do the math. The backend handles unit conversion, serving
  scaling, and de-duplication.
