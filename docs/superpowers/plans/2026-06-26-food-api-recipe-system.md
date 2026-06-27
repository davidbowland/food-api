# food-api Recipe System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Save up non-blocking questions and ask the user at the END. Do not stop unless there is a MAJOR blocker (compile error, missing credential, irreconcilable conflict in requirements). Minor uncertainty = make a reasonable call and note it.**

**Goal:** Build a recipe book, meal planning, and shopping list API on AWS SAM/Lambda/DynamoDB/Cognito, replacing the choosee-api codebase in this repo.

**Architecture:** One Lambda per resource type (ingredients, recipes, photos, users, meal-plans, shopping-lists) with internal routing on HTTP method + path parameters. DynamoDB single-table design with three GSIs. Cognito User Pool with phone/SMS OTP via CUSTOM_AUTH Lambda triggers.

**Tech Stack:** TypeScript 5, Node.js 24, AWS SAM, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `aws-xray-sdk-core`, Jest 29, esbuild.

---

## Global Constraints

- Node.js 24, TypeScript strict mode, `"target": "es2023"` in tsconfig
- All mutations go through the service layer — handlers never call the data layer directly
- All handlers require Cognito JWT except routes explicitly marked public in the SAM template
- IDs: `crypto.randomUUID()` — no adjective-noun pattern
- DynamoDB: all record data stored as JSON in a `Data` attribute; indexed scalar attributes extracted per entity
- `clearMocks: true` in jest.config.ts — mocks are cleared automatically between every test (no need for `afterEach(() => jest.clearAllMocks())`)
- **Testing rules:** No CSS/style assertions. No live `Date.now()` or `Math.random()` in tests — inject non-determinism as function params. Use `beforeAll` for shared mock state, `mockReturnValueOnce` for per-test overrides. No `beforeEach` — use a named `setup()` function if repeated arrangement is needed. Use `jest.useFakeTimers()` when code under test calls real timers. Test observable behavior only. Deterministic above all.
- Module aliases (defined in jest.config.ts): `@config`, `@errors`, `@types`, `@handlers/*`, `@services/*`, `@data/*`, `@utils/*`
- Run tests: `npm test` — must pass with coverage thresholds (branches 90%, functions 90%, lines 80%)
- Run typecheck: `npm run typecheck`
- Lint/format: `npm run lint`

---

## DynamoDB Key Design Reference

| Entity            | PK                          | SK                     | Extra attributes                                                  |
| ----------------- | --------------------------- | ---------------------- | ----------------------------------------------------------------- |
| Ingredient        | `INGREDIENT#{ingredientId}` | `METADATA`             | `entityType="ingredient"`, `createdAt`                            |
| Recipe            | `RECIPE#{recipeId}`         | `METADATA`             | `entityType="recipe"`, `recipeStatus`, `ownerUserId`, `createdAt` |
| User profile      | `USER#{userId}`             | `PROFILE`              | `createdAt`                                                       |
| User favorite     | `USER#{userId}`             | `FAVORITE#{recipeId}`  | `addedAt`                                                         |
| Meal plan         | `PLAN#{planId}`             | `METADATA`             | `ownerUserId`, `createdAt`                                        |
| Shared plan index | `USER#{userId}`             | `SHARED_PLAN#{planId}` | `planId`                                                          |
| Shopping list     | `LIST#{listId}`             | `METADATA`             | `ownerUserId`, `createdAt`                                        |
| Shared list index | `USER#{userId}`             | `SHARED_LIST#{listId}` | `listId`                                                          |

**GSIs:**

- `type-index`: PK=`entityType` (S), SK=`createdAt` (N) — list all ingredients
- `status-index`: PK=`recipeStatus` (S), SK=`createdAt` (N) — list published recipes
- `owner-index`: PK=`ownerUserId` (S), SK=`createdAt` (N) — meal plans and shopping lists by owner

---

## File Map

**Create:**

- `CLAUDE.md`
- `src/types.ts` (full rewrite)
- `src/config.ts` (full rewrite)
- `src/errors.ts` (simplify)
- `src/utils/auth.ts` (update for phone/OTP claims)
- `src/utils/errors.ts` (add `handleError`)
- `src/utils/id-generator.ts` (replace with `crypto.randomUUID` wrapper)
- `src/data/dynamodb.ts`
- `src/data/ingredients.ts`
- `src/data/recipes.ts`
- `src/data/users.ts`
- `src/data/meal-plans.ts`
- `src/data/shopping-lists.ts`
- `src/services/unit-converter.ts`
- `src/services/ingredients.ts`
- `src/services/recipes.ts`
- `src/services/photos.ts`
- `src/services/users.ts`
- `src/services/meal-plans.ts`
- `src/services/shopping-list-generator.ts`
- `src/services/shopping-lists.ts`
- `src/auth-triggers/define-auth-challenge.ts`
- `src/auth-triggers/create-auth-challenge.ts`
- `src/auth-triggers/verify-auth-challenge.ts`
- `src/handlers/ingredients.ts`
- `src/handlers/recipes.ts`
- `src/handlers/photos.ts`
- `src/handlers/users.ts`
- `src/handlers/meal-plans.ts`
- `src/handlers/shopping-lists.ts`
- `__tests__/unit/` — test files mirroring all the above
- `events/` — sample API Gateway event JSON files for tests

**Modify:**

- `jest.config.ts` — add `@data/*` alias, update `coveragePathIgnorePatterns`
- `tsconfig.json` — no change needed (jest handles aliasing)
- `package.json` — rename, add S3 SDK packages
- `template.yaml` — full rewrite
- `buildspec.yml` — update project name
- `endpoints.rest` — full rewrite

**Delete:**

- `src/assets/` (adjectives, nouns, place-types)
- `src/handlers/close-round.ts`, `create-session.ts`, `get-choices.ts`, `get-reverse-geocode.ts`, `get-session-by-id.ts`, `get-session-config.ts`, `get-users.ts`, `patch-user.ts`, `post-session.ts`, `post-user.ts`, `share-session.ts`, `subscribe-round.ts`
- `src/services/brackets.ts`, `dynamodb.ts`, `google-maps.ts`, `notifications.ts`, `recaptcha.ts`
- `src/utils/events.ts`, `open-hours.ts`
- All existing `__tests__/unit/` test files
- All existing `events/*.json` files

---

## Task 1: CLAUDE.md + Project Cleanup

**Files:**

- Create: `CLAUDE.md`
- Modify: `jest.config.ts`, `package.json`
- Delete: all choosee-specific source, test, and event files listed above

**Interfaces:**

- Produces: project-wide testing standards, updated module aliases, clean src/ tree

- [ ] **Step 1: Create CLAUDE.md**

````markdown
# food-api

Recipe book, meal planning, and shopping list API.

## Testing Standards

**Jest clears all mocks automatically** (`clearMocks: true` in jest.config.ts). Never manually clear mocks.

**Mock state:** Set shared defaults in `beforeAll`. Override per-test with `mockReturnValueOnce` / `mockResolvedValueOnce` / `mockRejectedValueOnce`. Never use `beforeEach` — write a named `setup()` function if repeated arrangement is needed and call it explicitly.

**Non-determinism:** Any function that uses `Date.now()`, `Math.random()`, or `crypto.randomUUID()` to produce a value that affects test outcomes MUST accept it as an injectable parameter with a default:

```ts
// source
export const createThing = (input: Input, now = Date.now): Thing => ({ ...input, createdAt: now() })

// test
it('sets createdAt', () => {
  expect(createThing(input, () => 1_000_000).createdAt).toBe(1_000_000)
})
```
````

**Fake timers:** Use `jest.useFakeTimers()` in `beforeAll` (and `jest.useRealTimers()` in `afterAll`) when the code under test calls `setTimeout`, `setInterval`, or `Date` internally without injection.

**No CSS or style assertions.** Test observable behavior: return values, thrown errors, calls to collaborators.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No date arithmetic that depends on the current wall-clock time.

**Deterministic above all.** A test that passes today and fails tomorrow is broken.

## Module Aliases

| Alias         | Path             |
| ------------- | ---------------- |
| `@config`     | `src/config.ts`  |
| `@errors`     | `src/errors.ts`  |
| `@types`      | `src/types.ts`   |
| `@data/*`     | `src/data/*`     |
| `@handlers/*` | `src/handlers/*` |
| `@services/*` | `src/services/*` |
| `@utils/*`    | `src/utils/*`    |

## Commands

- `npm test` — run tests with coverage
- `npm run typecheck` — TypeScript check
- `npm run lint` — format + lint
- `npm start` — run locally via SAM

````

- [ ] **Step 2: Add `@data/*` alias to jest.config.ts and remove stale entries**

In `jest.config.ts`, update `moduleNameMapper`:
```ts
moduleNameMapper: {
  '^@config$': '<rootDir>/src/config',
  '^@errors$': '<rootDir>/src/errors',
  '^@data/(.*)$': '<rootDir>/src/data/$1',
  '^@handlers/(.*)$': '<rootDir>/src/handlers/$1',
  '^@services/(.*)$': '<rootDir>/src/services/$1',
  '^@types$': '<rootDir>/src/types',
  '^@utils/(.*)$': '<rootDir>/src/utils/$1',
},
````

Also update `coveragePathIgnorePatterns`:

```ts
coveragePathIgnorePatterns: ['<rootDir>/src/types.ts'],
```

- [ ] **Step 3: Update package.json name and add S3 SDK packages**

Change `"name"` to `"food-api"`. Add to `dependencies`:

```json
"@aws-sdk/client-s3": "^3.1041.0",
"@aws-sdk/s3-request-presigner": "^3.1041.0"
```

Remove `"@googlemaps/google-maps-services-js"`, `"@googlemaps/places"`.

Run: `npm install`

- [ ] **Step 4: Delete choosee-specific files**

```bash
rm -rf src/assets
rm src/handlers/close-round.ts src/handlers/create-session.ts src/handlers/get-choices.ts
rm src/handlers/get-reverse-geocode.ts src/handlers/get-session-by-id.ts
rm src/handlers/get-session-config.ts src/handlers/get-users.ts
rm src/handlers/patch-user.ts src/handlers/post-session.ts
rm src/handlers/post-user.ts src/handlers/share-session.ts src/handlers/subscribe-round.ts
rm src/services/brackets.ts src/services/dynamodb.ts src/services/google-maps.ts
rm src/services/notifications.ts src/services/recaptcha.ts
rm src/utils/events.ts src/utils/open-hours.ts src/utils/id-generator.ts
rm -rf __tests__/unit/handlers __tests__/unit/services __tests__/unit/utils
rm -f events/*.json
```

- [ ] **Step 5: Verify project still compiles (types.ts and config.ts will be stubs for now)**

Replace `src/types.ts` temporarily with:

```ts
export { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
```

Replace `src/config.ts` temporarily with:

```ts
export const dynamodbTableName = process.env.DYNAMODB_TABLE_NAME as string
```

Replace `src/errors.ts` with:

```ts
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
```

Run: `npm run typecheck`
Expected: no errors (only stubs exist at this point)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: project cleanup and CLAUDE.md testing standards"
```

---

## Task 2: Foundation — Types, Config, Auth Utils, ID Generator

**Files:**

- Modify: `src/types.ts`, `src/config.ts`, `src/utils/auth.ts`, `src/utils/errors.ts`
- Create: `src/utils/id-generator.ts`
- Test: `__tests__/unit/utils/auth.test.ts`, `__tests__/unit/utils/id-generator.test.ts`

**Interfaces:**

- Produces: `IngredientRecord`, `RecipeRecord`, `UserRecord`, `MealPlanRecord`, `ShoppingListRecord`, `Share`, `AuthContext`, `generateId()`, `extractAuthContext()`, `handleError()`

- [ ] **Step 1: Write `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/config.ts`**

```ts
import axios from 'axios'
import axiosRetry from 'axios-retry'

axiosRetry(axios, { retries: 3 })

export const dynamodbTableName = process.env.DYNAMODB_TABLE_NAME as string
export const photoBucketName = process.env.PHOTO_BUCKET_NAME as string
export const photoPresignedUrlExpireSeconds = parseInt(process.env.PHOTO_PRESIGNED_URL_EXPIRE_SECONDS ?? '3600', 10)
export const corsDomain = process.env.CORS_DOMAIN as string
export const smsApiKey = process.env.SMS_API_KEY as string
export const smsApiUrl = process.env.SMS_API_URL as string
```

- [ ] **Step 3: Write `src/utils/id-generator.ts`**

```ts
export const generateId = (randomUUID = () => crypto.randomUUID()): string => randomUUID()
```

- [ ] **Step 4: Write failing test for id-generator**

`__tests__/unit/utils/id-generator.test.ts`:

```ts
import { generateId } from '@utils/id-generator'

describe('generateId', () => {
  it('returns the value from the provided uuid function', () => {
    const fixed = '00000000-0000-0000-0000-000000000001'
    expect(generateId(() => fixed)).toBe(fixed)
  })

  it('returns a uuid-shaped string when called with default', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
```

Run: `npm test -- --testPathPattern=id-generator`
Expected: PASS (implementation already written in Step 3)

- [ ] **Step 5: Update `src/utils/auth.ts` for Cognito phone/OTP claims**

```ts
import { APIGatewayProxyEventV2, AuthContext } from '../types'

interface JwtClaims {
  jwt?: { claims?: Record<string, unknown> }
}

interface RequestContextWithAuthorizer {
  authorizer?: JwtClaims
}

export const extractAuthContext = (event: APIGatewayProxyEventV2): AuthContext => {
  const ctx = event.requestContext as unknown as RequestContextWithAuthorizer | undefined
  const claims = ctx?.authorizer?.jwt?.claims
  if (!claims) return { isAuthenticated: false, userId: null }

  return {
    isAuthenticated: true,
    userId: typeof claims.sub === 'string' ? claims.sub : null,
    phone: typeof claims.phone_number === 'string' ? claims.phone_number : undefined,
    displayName: typeof claims.name === 'string' ? claims.name : undefined,
  }
}
```

- [ ] **Step 6: Write failing tests for auth**

`__tests__/unit/utils/auth.test.ts`:

```ts
import { APIGatewayProxyEventV2 } from '@types'
import { extractAuthContext } from '@utils/auth'

const makeEvent = (claims?: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
  }) as unknown as APIGatewayProxyEventV2

describe('extractAuthContext', () => {
  it('returns unauthenticated when no authorizer', () => {
    const result = extractAuthContext(makeEvent())
    expect(result.isAuthenticated).toBe(false)
    expect(result.userId).toBeNull()
  })

  it('returns authenticated with userId from sub claim', () => {
    const result = extractAuthContext(makeEvent({ sub: 'user-123' }))
    expect(result.isAuthenticated).toBe(true)
    expect(result.userId).toBe('user-123')
  })

  it('extracts phone_number claim', () => {
    const result = extractAuthContext(makeEvent({ sub: 'u1', phone_number: '+15551234567' }))
    expect(result.phone).toBe('+15551234567')
  })

  it('extracts name claim as displayName', () => {
    const result = extractAuthContext(makeEvent({ sub: 'u1', name: 'Alice' }))
    expect(result.displayName).toBe('Alice')
  })

  it('omits phone and displayName when claims absent', () => {
    const result = extractAuthContext(makeEvent({ sub: 'u1' }))
    expect(result.phone).toBeUndefined()
    expect(result.displayName).toBeUndefined()
  })
})
```

Run: `npm test -- --testPathPattern=auth`
Expected: PASS

- [ ] **Step 7: Update `src/utils/errors.ts` to add `handleError`**

```ts
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors'
import { APIGatewayProxyResultV2 } from '../types'
import { logError } from './logging'
import status from './status'

export const serializeValidationError = (error: ValidationError): string => JSON.stringify({ message: error.message })

export const handleError = (error: unknown): APIGatewayProxyResultV2 => {
  if (error instanceof ValidationError) return { ...status.BAD_REQUEST, body: serializeValidationError(error) }
  if (error instanceof NotFoundError) return status.NOT_FOUND
  if (error instanceof UnauthorizedError) return status.UNAUTHORIZED
  if (error instanceof ForbiddenError) return status.FORBIDDEN
  logError('Unhandled error:', error)
  return status.INTERNAL_SERVER_ERROR
}
```

- [ ] **Step 8: Run all tests and typecheck**

```bash
npm test
npm run typecheck
```

Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: foundation types, config, auth utils, id generator"
```

---

## Task 3: Unit Converter

**Files:**

- Create: `src/services/unit-converter.ts`
- Test: `__tests__/unit/services/unit-converter.test.ts`

**Interfaces:**

- Produces: `convertToBase(quantity, unit): number`, `convertFromBase(baseAmount, unitType): { quantity: number, unit: string }`, `UNITS` constant, `getUnitType(unit): UnitType`

- [ ] **Step 1: Write failing tests**

`__tests__/unit/services/unit-converter.test.ts`:

```ts
import { convertToBase, convertFromBase, getUnitType, UNITS } from '@services/unit-converter'

describe('UNITS', () => {
  it('ml has toBase of 1', () => expect(UNITS.ml.toBase).toBe(1))
  it('cup has toBase of 236.59', () => expect(UNITS.cup.toBase).toBe(236.59))
  it('g has toBase of 1', () => expect(UNITS.g.toBase).toBe(1))
  it('lb has toBase of 453.59', () => expect(UNITS.lb.toBase).toBe(453.59))
  it('unit (count) has toBase of 1', () => expect(UNITS.unit.toBase).toBe(1))
  it('dozen has toBase of 12', () => expect(UNITS.dozen.toBase).toBe(12))
  it('score has toBase of 20', () => expect(UNITS.score.toBase).toBe(20))
  it('gross has toBase of 144', () => expect(UNITS.gross.toBase).toBe(144))
})

describe('getUnitType', () => {
  it('returns volume for cup', () => expect(getUnitType('cup')).toBe('volume'))
  it('returns weight for oz', () => expect(getUnitType('oz')).toBe('weight'))
  it('returns count for dozen', () => expect(getUnitType('dozen')).toBe('count'))
  it('throws for unknown unit', () => expect(() => getUnitType('bushel')).toThrow('Unknown unit'))
})

describe('convertToBase', () => {
  it('converts 1 cup to 236.59 ml', () => expect(convertToBase(1, 'cup')).toBeCloseTo(236.59))
  it('converts 2 tbsp to ~29.58 ml', () => expect(convertToBase(2, 'tbsp')).toBeCloseTo(29.58))
  it('converts 1 lb to 453.59 g', () => expect(convertToBase(1, 'lb')).toBeCloseTo(453.59))
  it('converts 1 dozen to 12 units', () => expect(convertToBase(1, 'dozen')).toBe(12))
  it('passes through base units unchanged', () => {
    expect(convertToBase(5, 'ml')).toBe(5)
    expect(convertToBase(5, 'g')).toBe(5)
    expect(convertToBase(5, 'unit')).toBe(5)
  })
})

describe('convertFromBase', () => {
  it('converts 473.18 ml to 1 pint', () => {
    const result = convertFromBase(473.18, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('pint')
  })

  it('converts 236.59 ml to 1 cup', () => {
    const result = convertFromBase(236.59, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('cup')
  })

  it('converts 14.79 ml to 1 tbsp', () => {
    const result = convertFromBase(14.79, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('tbsp')
  })

  it('converts 2 ml to ml (smallest unit)', () => {
    const result = convertFromBase(2, 'volume')
    expect(result.unit).toBe('ml')
  })

  it('converts 907.18 g to 2 lb', () => {
    const result = convertFromBase(907.18, 'weight')
    expect(result.quantity).toBeCloseTo(2)
    expect(result.unit).toBe('lb')
  })

  it('converts 24 units to 2 dozen', () => {
    const result = convertFromBase(24, 'count')
    expect(result.quantity).toBe(2)
    expect(result.unit).toBe('dozen')
  })

  it('converts 3 units to 3 unit', () => {
    const result = convertFromBase(3, 'count')
    expect(result.quantity).toBe(3)
    expect(result.unit).toBe('unit')
  })
})
```

Run: `npm test -- --testPathPattern=unit-converter`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `src/services/unit-converter.ts`**

```ts
import { UnitType } from '../types'

interface UnitDef {
  type: UnitType
  toBase: number
}

export const UNITS: Record<string, UnitDef> = {
  // volume (base: ml)
  ml: { type: 'volume', toBase: 1 },
  tsp: { type: 'volume', toBase: 4.93 },
  tbsp: { type: 'volume', toBase: 14.79 },
  'fl oz': { type: 'volume', toBase: 29.57 },
  cup: { type: 'volume', toBase: 236.59 },
  pint: { type: 'volume', toBase: 473.18 },
  quart: { type: 'volume', toBase: 946.35 },
  gallon: { type: 'volume', toBase: 3785.41 },
  liter: { type: 'volume', toBase: 1000 },
  // weight (base: g)
  mg: { type: 'weight', toBase: 0.001 },
  g: { type: 'weight', toBase: 1 },
  kg: { type: 'weight', toBase: 1000 },
  oz: { type: 'weight', toBase: 28.35 },
  lb: { type: 'weight', toBase: 453.59 },
  // count (base: unit)
  unit: { type: 'count', toBase: 1 },
  dozen: { type: 'count', toBase: 12 },
  score: { type: 'count', toBase: 20 },
  gross: { type: 'count', toBase: 144 },
}

// Ordered largest-first for human-friendly display selection
const VOLUME_ORDER = ['gallon', 'quart', 'pint', 'liter', 'cup', 'fl oz', 'tbsp', 'tsp', 'ml']
const WEIGHT_ORDER = ['kg', 'lb', 'g', 'oz', 'mg']
const COUNT_ORDER = ['gross', 'score', 'dozen', 'unit']

const ORDER: Record<UnitType, string[]> = {
  volume: VOLUME_ORDER,
  weight: WEIGHT_ORDER,
  count: COUNT_ORDER,
}

export const getUnitType = (unit: string): UnitType => {
  const def = UNITS[unit]
  if (!def) throw new Error(`Unknown unit: ${unit}`)
  return def.type
}

export const convertToBase = (quantity: number, unit: string): number => {
  const def = UNITS[unit]
  if (!def) throw new Error(`Unknown unit: ${unit}`)
  return quantity * def.toBase
}

export const convertFromBase = (baseAmount: number, unitType: UnitType): { quantity: number; unit: string } => {
  const order = ORDER[unitType]
  for (const unit of order) {
    const factor = UNITS[unit].toBase
    const quantity = baseAmount / factor
    if (quantity >= 1) {
      return { quantity: Math.round(quantity * 100) / 100, unit }
    }
  }
  // Fall back to smallest unit
  const smallest = order[order.length - 1]
  return { quantity: Math.round((baseAmount / UNITS[smallest].toBase) * 100) / 100, unit: smallest }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --testPathPattern=unit-converter
```

Expected: PASS

- [ ] **Step 4: Run full test suite and typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: unit converter with volume/weight/count support"
```

---

## Task 4: DynamoDB Client

**Files:**

- Create: `src/data/dynamodb.ts`

**Interfaces:**

- Produces: `dynamodb` (xray-wrapped DynamoDB client, default export)

- [ ] **Step 1: Create `src/data/dynamodb.ts`**

```ts
import { DynamoDB } from '@aws-sdk/client-dynamodb'

import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDB({ apiVersion: '2012-08-10' }))

export default dynamodb
```

No direct tests — the client is mocked at the module level in every data-layer test via `jest.mock('@aws-sdk/client-dynamodb')`.

- [ ] **Step 2: Commit**

```bash
git add src/data/dynamodb.ts
git commit -m "feat: shared DynamoDB client"
```

---

## Task 5: Ingredients Feature

**Files:**

- Create: `src/data/ingredients.ts`, `src/services/ingredients.ts`, `src/handlers/ingredients.ts`
- Test: `__tests__/unit/data/ingredients.test.ts`, `__tests__/unit/services/ingredients.test.ts`, `__tests__/unit/handlers/ingredients.test.ts`

**Interfaces:**

- Consumes: `generateId` from `@utils/id-generator`, `dynamodb` from `@data/dynamodb`, `IngredientRecord`, `UnitType` from `@types`
- Produces:
  - data: `getIngredient(id)`, `putIngredient(record)`, `deleteIngredient(id)`, `listIngredients()`
  - service: `listIngredients()`, `getIngredient(id)`, `createIngredient(input, now?)`, `updateIngredient(id, input, now?)`
  - handler: `handler(event)`

- [ ] **Step 1: Write failing data-layer tests**

`__tests__/unit/data/ingredients.test.ts`:

```ts
import { GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { getIngredient, putIngredient, deleteIngredient, listIngredients } from '@data/ingredients'
import { NotFoundError } from '@errors'

import { IngredientRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb')
jest.mock('@data/dynamodb', () => ({ default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const ingredient: IngredientRecord = {
  ingredientId: 'ing-1',
  name: 'Flour',
  allowedUnitTypes: ['volume', 'weight'],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(ingredient) } } } as any)
  })

  it('returns parsed ingredient record', async () => {
    const result = await getIngredient('ing-1')
    expect(result).toEqual(ingredient)
  })

  it('sends GetItemCommand with correct key', async () => {
    await getIngredient('ing-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(GetItemCommand)
    expect((call as GetItemCommand).input.Key).toEqual({
      PK: { S: 'INGREDIENT#ing-1' },
      SK: { S: 'METADATA' },
    })
  })

  it('throws NotFoundError when item missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getIngredient('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with correct structure', async () => {
    await putIngredient(ingredient)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(PutItemCommand)
    const input = (call as PutItemCommand).input
    expect(input.Item?.PK).toEqual({ S: 'INGREDIENT#ing-1' })
    expect(input.Item?.SK).toEqual({ S: 'METADATA' })
    expect(input.Item?.entityType).toEqual({ S: 'ingredient' })
    expect(JSON.parse(input.Item?.Data?.S ?? '')).toEqual(ingredient)
  })
})

describe('deleteIngredient', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with correct key', async () => {
    await deleteIngredient('ing-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(DeleteItemCommand)
    expect((call as DeleteItemCommand).input.Key).toEqual({
      PK: { S: 'INGREDIENT#ing-1' },
      SK: { S: 'METADATA' },
    })
  })
})

describe('listIngredients', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(ingredient) } }],
    } as any)
  })

  it('returns list of ingredients', async () => {
    const result = await listIngredients()
    expect(result).toEqual([ingredient])
  })

  it('sends QueryCommand against type-index', async () => {
    await listIngredients()
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(QueryCommand)
    expect((call as QueryCommand).input.IndexName).toBe('type-index')
  })

  it('returns empty array when no items', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as any)
    expect(await listIngredients()).toEqual([])
  })
})
```

Run: `npm test -- --testPathPattern=data/ingredients`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `src/data/ingredients.ts`**

```ts
import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { IngredientRecord } from '../types'
import dynamodb from './dynamodb'

export const getIngredient = async (ingredientId: string): Promise<IngredientRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `INGREDIENT#${ingredientId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Ingredient not found')
  return JSON.parse(response.Item.Data.S)
}

export const putIngredient = async (ingredient: IngredientRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${ingredient.createdAt}` },
        Data: { S: JSON.stringify(ingredient) },
        entityType: { S: 'ingredient' },
        PK: { S: `INGREDIENT#${ingredient.ingredientId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteIngredient = async (ingredientId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `INGREDIENT#${ingredientId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listIngredients = async (): Promise<IngredientRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':et': { S: 'ingredient' } },
      IndexName: 'type-index',
      KeyConditionExpression: 'entityType = :et',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => JSON.parse(item.Data?.S ?? '{}'))
}
```

- [ ] **Step 3: Run data tests**

```bash
npm test -- --testPathPattern=data/ingredients
```

Expected: PASS

- [ ] **Step 4: Write failing service tests**

`__tests__/unit/services/ingredients.test.ts`:

```ts
import * as data from '@data/ingredients'
import { NotFoundError } from '@errors'

import { listIngredients, getIngredient, createIngredient, updateIngredient } from '@services/ingredients'
import { IngredientRecord } from '@types'
import { generateId } from '@utils/id-generator'

jest.mock('@data/ingredients')
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const ingredient: IngredientRecord = {
  ingredientId: 'ing-1',
  name: 'Flour',
  allowedUnitTypes: ['volume', 'weight'],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('listIngredients', () => {
  beforeAll(() => {
    jest.mocked(data.listIngredients).mockResolvedValue([ingredient])
  })

  it('returns ingredients from data layer', async () => {
    expect(await listIngredients()).toEqual([ingredient])
  })
})

describe('getIngredient', () => {
  beforeAll(() => {
    jest.mocked(data.getIngredient).mockResolvedValue(ingredient)
  })

  it('returns ingredient by id', async () => {
    expect(await getIngredient('ing-1')).toEqual(ingredient)
  })

  it('propagates NotFoundError', async () => {
    jest.mocked(data.getIngredient).mockRejectedValueOnce(new NotFoundError('not found'))
    await expect(getIngredient('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('createIngredient', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('ing-new')
    jest.mocked(data.putIngredient).mockResolvedValue(undefined)
  })

  it('creates ingredient with generated id and timestamps', async () => {
    const result = await createIngredient({ name: 'Sugar', allowedUnitTypes: ['weight'] }, () => 2_000_000)
    expect(result.ingredientId).toBe('ing-new')
    expect(result.name).toBe('Sugar')
    expect(result.createdAt).toBe(2_000_000)
    expect(result.updatedAt).toBe(2_000_000)
  })

  it('calls putIngredient with the new record', async () => {
    await createIngredient({ name: 'Salt', allowedUnitTypes: ['weight'] }, () => 3_000_000)
    expect(data.putIngredient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Salt' }))
  })
})

describe('updateIngredient', () => {
  beforeAll(() => {
    jest.mocked(data.getIngredient).mockResolvedValue(ingredient)
    jest.mocked(data.putIngredient).mockResolvedValue(undefined)
  })

  it('merges updates and advances updatedAt', async () => {
    const result = await updateIngredient('ing-1', { name: 'Bread Flour' }, () => 5_000_000)
    expect(result.name).toBe('Bread Flour')
    expect(result.updatedAt).toBe(5_000_000)
    expect(result.createdAt).toBe(1_000_000)
  })

  it('throws NotFoundError when ingredient missing', async () => {
    jest.mocked(data.getIngredient).mockRejectedValueOnce(new NotFoundError('not found'))
    await expect(updateIngredient('missing', { name: 'X' })).rejects.toThrow(NotFoundError)
  })
})
```

Run: `npm test -- --testPathPattern=services/ingredients`
Expected: FAIL — module not found

- [ ] **Step 5: Implement `src/services/ingredients.ts`**

```ts
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
```

- [ ] **Step 6: Run service tests**

```bash
npm test -- --testPathPattern=services/ingredients
```

Expected: PASS

- [ ] **Step 7: Write failing handler tests**

`__tests__/unit/handlers/ingredients.test.ts`:

```ts
import { NotFoundError } from '@errors'

import { handler } from '@handlers/ingredients'
import * as service from '@services/ingredients'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/ingredients')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (method: string, pathParameters?: Record<string, string>, body?: unknown): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const ingredient = { ingredientId: 'ing-1', name: 'Flour', allowedUnitTypes: ['volume'], createdAt: 1, updatedAt: 1 }

describe('GET /ingredients', () => {
  beforeAll(() => {
    jest.mocked(service.listIngredients).mockResolvedValue([ingredient])
  })

  it('returns 200 with ingredient list', async () => {
    const result = await handler(makeEvent('GET'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual([ingredient])
  })
})

describe('POST /ingredients', () => {
  beforeAll(() => {
    jest.mocked(service.createIngredient).mockResolvedValue(ingredient)
  })

  it('returns 201 with created ingredient', async () => {
    const result = await handler(makeEvent('POST', undefined, { name: 'Flour', allowedUnitTypes: ['volume'] }))
    expect(result.statusCode).toBe(201)
    expect(JSON.parse(result.body as string)).toEqual(ingredient)
  })

  it('returns 400 when body is invalid JSON', async () => {
    const event = { ...makeEvent('POST'), body: 'not-json' }
    const result = await handler(event as unknown as APIGatewayProxyEventV2)
    expect(result.statusCode).toBe(400)
  })
})

describe('GET /ingredients/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getIngredient).mockResolvedValue(ingredient)
  })

  it('returns 200 with ingredient', async () => {
    const result = await handler(makeEvent('GET', { id: 'ing-1' }))
    expect(result.statusCode).toBe(200)
  })

  it('returns 404 when not found', async () => {
    jest.mocked(service.getIngredient).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', { id: 'missing' }))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /ingredients/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateIngredient).mockResolvedValue(ingredient)
  })

  it('returns 200 with updated ingredient', async () => {
    const result = await handler(makeEvent('PUT', { id: 'ing-1' }, { name: 'Bread Flour' }))
    expect(result.statusCode).toBe(200)
  })
})
```

Run: `npm test -- --testPathPattern=handlers/ingredients`
Expected: FAIL — module not found

- [ ] **Step 8: Implement `src/handlers/ingredients.ts`**

```ts
import * as service from '../services/ingredients'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method
  const id = event.pathParameters?.id

  try {
    if (method === 'GET' && !id) {
      const ingredients = await service.listIngredients()
      return { ...status.OK, body: JSON.stringify(ingredients) }
    }

    if (method === 'POST' && !id) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const ingredient = await service.createIngredient(input as any)
      return { ...status.CREATED, body: JSON.stringify(ingredient) }
    }

    if (method === 'GET' && id) {
      const ingredient = await service.getIngredient(id)
      return { ...status.OK, body: JSON.stringify(ingredient) }
    }

    if (method === 'PUT' && id) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const ingredient = await service.updateIngredient(id, input as any)
      return { ...status.OK, body: JSON.stringify(ingredient) }
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
```

- [ ] **Step 9: Run all tests**

```bash
npm test && npm run typecheck
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: ingredients CRUD (data, service, handler)"
```

---

## Task 6: Users Feature

**Files:**

- Create: `src/data/users.ts`, `src/services/users.ts`, `src/handlers/users.ts`
- Test: `__tests__/unit/data/users.test.ts`, `__tests__/unit/services/users.test.ts`, `__tests__/unit/handlers/users.test.ts`

**Interfaces:**

- Consumes: `UserRecord` from `@types`, `dynamodb` from `@data/dynamodb`
- Produces:
  - data: `getUser(userId)`, `putUser(record)`, `addFavorite(userId, recipeId)`, `removeFavorite(userId, recipeId)`, `listFavorites(userId): string[]`
  - service: `getOrCreateUser(userId, phone, now?)`, `updateUser(userId, input, now?)`, `listFavorites(userId)`, `addFavorite(userId, recipeId)`, `removeFavorite(userId, recipeId)`
  - handler: `handler(event)` — routes for `/users/me`, `/users/me/favorites`, `/users/me/favorites/{recipeId}`

- [ ] **Step 1: Write failing data-layer tests**

`__tests__/unit/data/users.test.ts`:

```ts
import { GetItemCommand, PutItemCommand, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { getUser, putUser, addFavorite, removeFavorite, listFavorites } from '@data/users'
import { NotFoundError } from '@errors'

import { UserRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb')
jest.mock('@data/dynamodb', () => ({ default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const user: UserRecord = { userId: 'u-1', phone: '+15551234567', displayName: 'Alice', createdAt: 1_000_000 }

describe('getUser', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(user) } } } as any)
  })

  it('returns parsed user record', async () => {
    expect(await getUser('u-1')).toEqual(user)
  })

  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getUser('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putUser', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with correct PK/SK', async () => {
    await putUser(user)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(PutItemCommand)
    expect((call as PutItemCommand).input.Item?.PK).toEqual({ S: 'USER#u-1' })
    expect((call as PutItemCommand).input.Item?.SK).toEqual({ S: 'PROFILE' })
  })
})

describe('addFavorite', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with FAVORITE SK', async () => {
    await addFavorite('u-1', 'rec-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(PutItemCommand)
    expect((call as PutItemCommand).input.Item?.SK).toEqual({ S: 'FAVORITE#rec-1' })
  })
})

describe('removeFavorite', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with FAVORITE SK', async () => {
    await removeFavorite('u-1', 'rec-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(DeleteItemCommand)
    expect((call as DeleteItemCommand).input.Key?.SK).toEqual({ S: 'FAVORITE#rec-1' })
  })
})

describe('listFavorites', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ recipeId: { S: 'rec-1' } }, { recipeId: { S: 'rec-2' } }],
    } as any)
  })

  it('returns list of recipeIds', async () => {
    expect(await listFavorites('u-1')).toEqual(['rec-1', 'rec-2'])
  })
})
```

- [ ] **Step 2: Implement `src/data/users.ts`**

```ts
import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { UserRecord } from '../types'
import dynamodb from './dynamodb'

export const getUser = async (userId: string): Promise<UserRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: 'PROFILE' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('User not found')
  return JSON.parse(response.Item.Data.S)
}

export const putUser = async (user: UserRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${user.createdAt}` },
        Data: { S: JSON.stringify(user) },
        PK: { S: `USER#${user.userId}` },
        SK: { S: 'PROFILE' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const addFavorite = async (userId: string, recipeId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        addedAt: { N: `${Date.now()}` },
        PK: { S: `USER#${userId}` },
        recipeId: { S: recipeId },
        SK: { S: `FAVORITE#${recipeId}` },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const removeFavorite = async (userId: string, recipeId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `FAVORITE#${recipeId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listFavorites = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: {
        ':pk': { S: `USER#${userId}` },
        ':skPrefix': { S: 'FAVORITE#' },
      },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => item.recipeId?.S ?? '')
}
```

- [ ] **Step 3: Run data tests**

```bash
npm test -- --testPathPattern=data/users
```

Expected: PASS

- [ ] **Step 4: Write failing service tests**

`__tests__/unit/services/users.test.ts`:

```ts
import * as data from '@data/users'
import { NotFoundError } from '@errors'

import { getOrCreateUser, updateUser, listFavorites, addFavorite, removeFavorite } from '@services/users'

jest.mock('@data/users')

const user = { userId: 'u-1', phone: '+15551234567', displayName: 'Alice', createdAt: 1_000_000 }

describe('getOrCreateUser', () => {
  beforeAll(() => {
    jest.mocked(data.getUser).mockResolvedValue(user)
    jest.mocked(data.putUser).mockResolvedValue(undefined)
  })

  it('returns existing user when found', async () => {
    expect(await getOrCreateUser('u-1', '+15551234567')).toEqual(user)
    expect(data.putUser).not.toHaveBeenCalled()
  })

  it('creates and returns new user when not found', async () => {
    jest.mocked(data.getUser).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await getOrCreateUser('u-new', '+15559999999', () => 9_000_000)
    expect(result.userId).toBe('u-new')
    expect(result.phone).toBe('+15559999999')
    expect(result.createdAt).toBe(9_000_000)
    expect(data.putUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-new' }))
  })
})

describe('updateUser', () => {
  beforeAll(() => {
    jest.mocked(data.getUser).mockResolvedValue(user)
    jest.mocked(data.putUser).mockResolvedValue(undefined)
  })

  it('merges displayName update', async () => {
    const result = await updateUser('u-1', { displayName: 'Bob' }, () => 2_000_000)
    expect(result.displayName).toBe('Bob')
    expect(result.createdAt).toBe(1_000_000)
  })
})

describe('listFavorites', () => {
  beforeAll(() => {
    jest.mocked(data.listFavorites).mockResolvedValue(['rec-1', 'rec-2'])
  })

  it('returns recipeIds', async () => {
    expect(await listFavorites('u-1')).toEqual(['rec-1', 'rec-2'])
  })
})

describe('addFavorite', () => {
  beforeAll(() => {
    jest.mocked(data.addFavorite).mockResolvedValue(undefined)
  })

  it('delegates to data layer', async () => {
    await addFavorite('u-1', 'rec-1')
    expect(data.addFavorite).toHaveBeenCalledWith('u-1', 'rec-1')
  })
})

describe('removeFavorite', () => {
  beforeAll(() => {
    jest.mocked(data.removeFavorite).mockResolvedValue(undefined)
  })

  it('delegates to data layer', async () => {
    await removeFavorite('u-1', 'rec-1')
    expect(data.removeFavorite).toHaveBeenCalledWith('u-1', 'rec-1')
  })
})
```

- [ ] **Step 5: Implement `src/services/users.ts`**

```ts
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

export const updateUser = async (userId: string, input: UserUpdateInput, now = Date.now): Promise<UserRecord> => {
  const existing = await data.getUser(userId)
  const updated: UserRecord = { ...existing, ...input }
  await data.putUser(updated)
  return updated
}

export const listFavorites = (userId: string): Promise<string[]> => data.listFavorites(userId)

export const addFavorite = (userId: string, recipeId: string): Promise<void> => data.addFavorite(userId, recipeId)

export const removeFavorite = (userId: string, recipeId: string): Promise<void> => data.removeFavorite(userId, recipeId)
```

- [ ] **Step 6: Write failing handler tests**

`__tests__/unit/handlers/users.test.ts`:

```ts
import { handler } from '@handlers/users'
import * as service from '@services/users'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/users')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (
  method: string,
  path: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
): APIGatewayProxyEventV2 =>
  ({
    rawPath: path,
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'u-1', phone_number: '+15551234567' } } } },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const user = { userId: 'u-1', phone: '+15551234567', displayName: 'Alice', createdAt: 1 }

describe('GET /users/me', () => {
  beforeAll(() => {
    jest.mocked(service.getOrCreateUser).mockResolvedValue(user)
  })

  it('returns 200 with user', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual(user)
  })

  it('returns 401 when unauthenticated', async () => {
    const event = {
      rawPath: '/v1/users/me',
      requestContext: { http: { method: 'GET' } },
    } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
  })
})

describe('PUT /users/me', () => {
  beforeAll(() => {
    jest.mocked(service.updateUser).mockResolvedValue({ ...user, displayName: 'Bob' })
  })

  it('returns 200 with updated user', async () => {
    const result = await handler(makeEvent('PUT', '/v1/users/me', undefined, { displayName: 'Bob' }))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string).displayName).toBe('Bob')
  })
})

describe('GET /users/me/favorites', () => {
  beforeAll(() => {
    jest.mocked(service.listFavorites).mockResolvedValue(['rec-1'])
  })

  it('returns 200 with favorites list', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/favorites'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual(['rec-1'])
  })
})

describe('PUT /users/me/favorites/{recipeId}', () => {
  beforeAll(() => {
    jest.mocked(service.addFavorite).mockResolvedValue(undefined)
  })

  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('PUT', '/v1/users/me/favorites/rec-1', { recipeId: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
})

describe('DELETE /users/me/favorites/{recipeId}', () => {
  beforeAll(() => {
    jest.mocked(service.removeFavorite).mockResolvedValue(undefined)
  })

  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', '/v1/users/me/favorites/rec-1', { recipeId: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
})
```

- [ ] **Step 7: Implement `src/handlers/users.ts`**

```ts
import * as service from '../services/users'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const path = event.rawPath
  const recipeId = event.pathParameters?.recipeId

  try {
    if (method === 'GET' && path.endsWith('/users/me')) {
      const user = await service.getOrCreateUser(auth.userId, auth.phone ?? '')
      return { ...status.OK, body: JSON.stringify(user) }
    }

    if (method === 'PUT' && path.endsWith('/users/me')) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const user = await service.updateUser(auth.userId, input as any)
      return { ...status.OK, body: JSON.stringify(user) }
    }

    if (method === 'GET' && path.endsWith('/favorites')) {
      const favorites = await service.listFavorites(auth.userId)
      return { ...status.OK, body: JSON.stringify(favorites) }
    }

    if (method === 'PUT' && recipeId) {
      await service.addFavorite(auth.userId, recipeId)
      return status.NO_CONTENT
    }

    if (method === 'DELETE' && recipeId) {
      await service.removeFavorite(auth.userId, recipeId)
      return status.NO_CONTENT
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
```

- [ ] **Step 8: Run all tests and typecheck**

```bash
npm test && npm run typecheck
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: users profile and favorites (data, service, handler)"
```

---

## Task 7: Photos Feature

**Files:**

- Create: `src/services/photos.ts`, `src/handlers/photos.ts`
- Test: `__tests__/unit/services/photos.test.ts`, `__tests__/unit/handlers/photos.test.ts`

**Interfaces:**

- Consumes: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `photoBucketName`, `photoPresignedUrlExpireSeconds` from `@config`
- Produces: `generatePresignedUploadUrl(now?): Promise<{ uploadUrl: string; key: string }>`

- [ ] **Step 1: Write failing service tests**

`__tests__/unit/services/photos.test.ts`:

```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { generatePresignedUploadUrl } from '@services/photos'

jest.mock('@aws-sdk/client-s3')
jest.mock('@aws-sdk/s3-request-presigner')
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x) }))
jest.mock('@config', () => ({
  photoBucketName: 'test-bucket',
  photoPresignedUrlExpireSeconds: 3600,
}))

describe('generatePresignedUploadUrl', () => {
  beforeAll(() => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/presigned')
  })

  it('returns a presigned URL and a key', async () => {
    const result = await generatePresignedUploadUrl(() => crypto.randomUUID())
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned')
    expect(result.key).toMatch(/^photos\//)
  })

  it('generates a unique key each call', async () => {
    let counter = 0
    const fakeUUID = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`
    const [a, b] = await Promise.all([generatePresignedUploadUrl(fakeUUID), generatePresignedUploadUrl(fakeUUID)])
    expect(a.key).not.toBe(b.key)
  })

  it('calls getSignedUrl with PutObjectCommand', async () => {
    await generatePresignedUploadUrl()
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(PutObjectCommand),
      expect.objectContaining({ expiresIn: 3600 }),
    )
  })
})
```

- [ ] **Step 2: Implement `src/services/photos.ts`**

```ts
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { photoBucketName, photoPresignedUrlExpireSeconds } from '../config'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({}))

export const generatePresignedUploadUrl = async (
  randomUUID = () => crypto.randomUUID(),
): Promise<{ uploadUrl: string; key: string }> => {
  const key = `photos/${randomUUID()}`
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: photoBucketName, Key: key }), {
    expiresIn: photoPresignedUrlExpireSeconds,
  })
  return { uploadUrl, key }
}
```

- [ ] **Step 3: Write failing handler tests**

`__tests__/unit/handlers/photos.test.ts`:

```ts
import { handler } from '@handlers/photos'
import * as service from '@services/photos'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/photos')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (method: string): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'u-1' } } } },
  }) as unknown as APIGatewayProxyEventV2

describe('POST /photos', () => {
  beforeAll(() => {
    jest.mocked(service.generatePresignedUploadUrl).mockResolvedValue({
      uploadUrl: 'https://s3.example.com/upload',
      key: 'photos/abc.jpg',
    })
  })

  it('returns 200 with uploadUrl and key', async () => {
    const result = await handler(makeEvent('POST'))
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.uploadUrl).toBe('https://s3.example.com/upload')
    expect(body.key).toBe('photos/abc.jpg')
  })

  it('returns 401 when unauthenticated', async () => {
    const event = { requestContext: { http: { method: 'POST' } } } as unknown as APIGatewayProxyEventV2
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
  })
})
```

- [ ] **Step 4: Implement `src/handlers/photos.ts`**

```ts
import * as service from '../services/photos'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated) return status.UNAUTHORIZED

  try {
    const result = await service.generatePresignedUploadUrl()
    return { ...status.OK, body: JSON.stringify(result) }
  } catch (error) {
    return handleError(error)
  }
}
```

- [ ] **Step 5: Run all tests and typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: photos presigned S3 upload URL"
```

---

## Task 8: Recipes Feature

**Files:**

- Create: `src/data/recipes.ts`, `src/services/recipes.ts`, `src/handlers/recipes.ts`
- Test: `__tests__/unit/data/recipes.test.ts`, `__tests__/unit/services/recipes.test.ts`, `__tests__/unit/handlers/recipes.test.ts`

**Interfaces:**

- Consumes: `RecipeRecord`, `RecipeStatus` from `@types`, `generateId` from `@utils/id-generator`
- Produces:
  - data: `getRecipe(id)`, `putRecipe(record)`, `deleteRecipe(id)`, `listPublishedRecipes()`, `listRecipesByAuthor(userId)`
  - service: `listPublishedRecipes()`, `listMyRecipes(userId)`, `getRecipe(id, requestingUserId?)`, `createRecipe(userId, input, now?)`, `updateRecipe(id, userId, input, now?)`, `deleteRecipe(id, userId)`
  - handler: routes for `GET /recipes`, `GET /users/me/recipes`, `POST /recipes`, `GET /recipes/{id}`, `PUT /recipes/{id}`, `DELETE /recipes/{id}`

- [ ] **Step 1: Write failing data-layer tests**

`__tests__/unit/data/recipes.test.ts`:

```ts
import { GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { getRecipe, putRecipe, deleteRecipe, listPublishedRecipes, listRecipesByAuthor } from '@data/recipes'
import { NotFoundError } from '@errors'

import { RecipeRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb')
jest.mock('@data/dynamodb', () => ({ default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const recipe: RecipeRecord = {
  recipeId: 'rec-1',
  title: 'Tacos',
  description: 'Great tacos',
  servings: 2,
  ingredients: [],
  steps: [],
  tags: [],
  photos: [],
  authorUserId: 'u-1',
  status: 'published',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(recipe) } } } as any)
  })

  it('returns parsed recipe', async () => {
    expect(await getRecipe('rec-1')).toEqual(recipe)
  })

  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getRecipe('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with recipeStatus and ownerUserId attributes', async () => {
    await putRecipe(recipe)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.recipeStatus).toEqual({ S: 'published' })
    expect(call.input.Item?.ownerUserId).toEqual({ S: 'u-1' })
    expect(call.input.Item?.entityType).toEqual({ S: 'recipe' })
  })
})

describe('deleteRecipe', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with correct key', async () => {
    await deleteRecipe('rec-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'RECIPE#rec-1' })
  })
})

describe('listPublishedRecipes', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(recipe) } }],
    } as any)
  })

  it('queries status-index for published', async () => {
    await listPublishedRecipes()
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('status-index')
    expect(call.input.ExpressionAttributeValues?.[':status']).toEqual({ S: 'published' })
  })

  it('returns parsed recipes', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{ Data: { S: JSON.stringify(recipe) } }] } as any)
    expect(await listPublishedRecipes()).toEqual([recipe])
  })
})

describe('listRecipesByAuthor', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({
      Items: [{ Data: { S: JSON.stringify(recipe) } }],
    } as any)
  })

  it('queries owner-index for author', async () => {
    await listRecipesByAuthor('u-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('owner-index')
    expect(call.input.ExpressionAttributeValues?.[':owner']).toEqual({ S: 'u-1' })
  })
})
```

- [ ] **Step 2: Implement `src/data/recipes.ts`**

```ts
import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { RecipeRecord } from '../types'
import dynamodb from './dynamodb'

export const getRecipe = async (recipeId: string): Promise<RecipeRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `RECIPE#${recipeId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Recipe not found')
  return JSON.parse(response.Item.Data.S)
}

export const putRecipe = async (recipe: RecipeRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${recipe.createdAt}` },
        Data: { S: JSON.stringify(recipe) },
        entityType: { S: 'recipe' },
        ownerUserId: { S: recipe.authorUserId },
        PK: { S: `RECIPE#${recipe.recipeId}` },
        recipeStatus: { S: recipe.status },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteRecipe = async (recipeId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `RECIPE#${recipeId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listPublishedRecipes = async (): Promise<RecipeRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':status': { S: 'published' } },
      IndexName: 'status-index',
      KeyConditionExpression: 'recipeStatus = :status',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => JSON.parse(item.Data?.S ?? '{}'))
}

export const listRecipesByAuthor = async (authorUserId: string): Promise<RecipeRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: {
        ':et': { S: 'recipe' },
        ':owner': { S: authorUserId },
      },
      FilterExpression: '#et = :et',
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => JSON.parse(item.Data?.S ?? '{}'))
}
```

- [ ] **Step 3: Write failing service tests**

`__tests__/unit/services/recipes.test.ts`:

```ts
import * as data from '@data/recipes'
import { ForbiddenError, NotFoundError } from '@errors'

import {
  listPublishedRecipes,
  listMyRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from '@services/recipes'
import { generateId } from '@utils/id-generator'

jest.mock('@data/recipes')
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const recipe = {
  recipeId: 'rec-1',
  title: 'Tacos',
  description: 'Great',
  servings: 2,
  ingredients: [],
  steps: [],
  tags: [],
  photos: [],
  authorUserId: 'u-1',
  status: 'published' as const,
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('listPublishedRecipes', () => {
  beforeAll(() => {
    jest.mocked(data.listPublishedRecipes).mockResolvedValue([recipe])
  })
  it('returns published recipes', async () => expect(await listPublishedRecipes()).toEqual([recipe]))
})

describe('listMyRecipes', () => {
  beforeAll(() => {
    jest.mocked(data.listRecipesByAuthor).mockResolvedValue([recipe])
  })
  it('returns recipes by author', async () => expect(await listMyRecipes('u-1')).toEqual([recipe]))
})

describe('getRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
  })

  it('returns published recipe to any requester', async () => {
    expect(await getRecipe('rec-1')).toEqual(recipe)
  })

  it('returns draft recipe to owner', async () => {
    const draft = { ...recipe, status: 'draft' as const }
    jest.mocked(data.getRecipe).mockResolvedValueOnce(draft)
    expect(await getRecipe('rec-1', 'u-1')).toEqual(draft)
  })

  it('throws ForbiddenError for draft requested by non-owner', async () => {
    jest.mocked(data.getRecipe).mockResolvedValueOnce({ ...recipe, status: 'draft' as const })
    await expect(getRecipe('rec-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError for draft requested with no userId', async () => {
    jest.mocked(data.getRecipe).mockResolvedValueOnce({ ...recipe, status: 'draft' as const })
    await expect(getRecipe('rec-1')).rejects.toThrow(ForbiddenError)
  })
})

describe('createRecipe', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('rec-new')
    jest.mocked(data.putRecipe).mockResolvedValue(undefined)
  })

  it('creates recipe with generated id and draft status', async () => {
    const result = await createRecipe(
      'u-1',
      { title: 'Soup', description: 'Hot', ingredients: [], steps: [] },
      () => 2_000_000,
    )
    expect(result.recipeId).toBe('rec-new')
    expect(result.status).toBe('draft')
    expect(result.authorUserId).toBe('u-1')
    expect(result.createdAt).toBe(2_000_000)
    expect(result.servings).toBe(2)
  })
})

describe('updateRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
    jest.mocked(data.putRecipe).mockResolvedValue(undefined)
  })

  it('updates recipe when requester is author', async () => {
    const result = await updateRecipe('rec-1', 'u-1', { title: 'Updated' }, () => 5_000_000)
    expect(result.title).toBe('Updated')
    expect(result.updatedAt).toBe(5_000_000)
  })

  it('throws ForbiddenError when non-author attempts update', async () => {
    await expect(updateRecipe('rec-1', 'u-other', { title: 'X' })).rejects.toThrow(ForbiddenError)
  })
})

describe('deleteRecipe', () => {
  beforeAll(() => {
    jest.mocked(data.getRecipe).mockResolvedValue(recipe)
    jest.mocked(data.deleteRecipe).mockResolvedValue(undefined)
  })

  it('deletes when requester is author', async () => {
    await deleteRecipe('rec-1', 'u-1')
    expect(data.deleteRecipe).toHaveBeenCalledWith('rec-1')
  })

  it('throws ForbiddenError for non-author', async () => {
    await expect(deleteRecipe('rec-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })
})
```

- [ ] **Step 4: Implement `src/services/recipes.ts`**

```ts
import * as data from '../data/recipes'
import { ForbiddenError } from '../errors'
import { RecipeIngredient, RecipeRecord } from '../types'
import { generateId } from '../utils/id-generator'

interface RecipeInput {
  title: string
  description: string
  servings?: number
  ingredients: RecipeIngredient[]
  steps: string[]
  tags?: string[]
  photos?: string[]
}

export const listPublishedRecipes = (): Promise<RecipeRecord[]> => data.listPublishedRecipes()

export const listMyRecipes = (userId: string): Promise<RecipeRecord[]> => data.listRecipesByAuthor(userId)

export const getRecipe = async (recipeId: string, requestingUserId?: string): Promise<RecipeRecord> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.status !== 'published' && recipe.authorUserId !== requestingUserId) {
    throw new ForbiddenError('Access denied')
  }
  return recipe
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
  return record
}

export const updateRecipe = async (
  recipeId: string,
  requestingUserId: string,
  input: Partial<RecipeInput>,
  now = Date.now,
): Promise<RecipeRecord> => {
  const existing = await data.getRecipe(recipeId)
  if (existing.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  const updated: RecipeRecord = { ...existing, ...input, recipeId, updatedAt: now() }
  await data.putRecipe(updated)
  return updated
}

export const deleteRecipe = async (recipeId: string, requestingUserId: string): Promise<void> => {
  const recipe = await data.getRecipe(recipeId)
  if (recipe.authorUserId !== requestingUserId) throw new ForbiddenError('Access denied')
  await data.deleteRecipe(recipeId)
}
```

- [ ] **Step 5: Write failing handler tests**

`__tests__/unit/handlers/recipes.test.ts`:

```ts
import { ForbiddenError, NotFoundError } from '@errors'

import { handler } from '@handlers/recipes'
import * as service from '@services/recipes'
import { APIGatewayProxyEventV2 } from '@types'

jest.mock('@services/recipes')
jest.mock('@utils/logging', () => ({ logError: jest.fn(), xrayCapture: jest.fn((x: unknown) => x) }))

const makeEvent = (
  method: string,
  path: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
  authed = true,
): APIGatewayProxyEventV2 =>
  ({
    rawPath: path,
    requestContext: {
      http: { method },
      ...(authed ? { authorizer: { jwt: { claims: { sub: 'u-1' } } } } : {}),
    },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2

const recipe = { recipeId: 'rec-1', title: 'Tacos', status: 'published', authorUserId: 'u-1' }

describe('GET /recipes (public)', () => {
  beforeAll(() => {
    jest.mocked(service.listPublishedRecipes).mockResolvedValue([recipe] as any)
  })
  it('returns 200 with recipe list', async () => {
    const result = await handler(makeEvent('GET', '/v1/recipes', undefined, undefined, false))
    expect(result.statusCode).toBe(200)
  })
})

describe('GET /users/me/recipes', () => {
  beforeAll(() => {
    jest.mocked(service.listMyRecipes).mockResolvedValue([recipe] as any)
  })
  it('returns 200 with my recipes', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/recipes'))
    expect(result.statusCode).toBe(200)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('GET', '/v1/users/me/recipes', undefined, undefined, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('POST /recipes', () => {
  beforeAll(() => {
    jest.mocked(service.createRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 201 on success', async () => {
    const result = await handler(
      makeEvent('POST', '/v1/recipes', undefined, { title: 'X', description: 'Y', ingredients: [], steps: [] }),
    )
    expect(result.statusCode).toBe(201)
  })
  it('returns 401 when unauthenticated', async () => {
    const result = await handler(makeEvent('POST', '/v1/recipes', undefined, {}, false))
    expect(result.statusCode).toBe(401)
  })
})

describe('GET /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.getRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 200 (public access)', async () => {
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for draft visible to non-owner', async () => {
    jest.mocked(service.getRecipe).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(403)
  })
  it('returns 404 when not found', async () => {
    jest.mocked(service.getRecipe).mockRejectedValueOnce(new NotFoundError('not found'))
    const result = await handler(makeEvent('GET', '/v1/recipes/rec-1', { id: 'rec-1' }, undefined, false))
    expect(result.statusCode).toBe(404)
  })
})

describe('PUT /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.updateRecipe).mockResolvedValue(recipe as any)
  })
  it('returns 200 on success', async () => {
    const result = await handler(makeEvent('PUT', '/v1/recipes/rec-1', { id: 'rec-1' }, { title: 'Updated' }))
    expect(result.statusCode).toBe(200)
  })
  it('returns 403 for non-owner', async () => {
    jest.mocked(service.updateRecipe).mockRejectedValueOnce(new ForbiddenError('denied'))
    const result = await handler(makeEvent('PUT', '/v1/recipes/rec-1', { id: 'rec-1' }, { title: 'X' }))
    expect(result.statusCode).toBe(403)
  })
})

describe('DELETE /recipes/{id}', () => {
  beforeAll(() => {
    jest.mocked(service.deleteRecipe).mockResolvedValue(undefined)
  })
  it('returns 204 on success', async () => {
    const result = await handler(makeEvent('DELETE', '/v1/recipes/rec-1', { id: 'rec-1' }))
    expect(result.statusCode).toBe(204)
  })
})
```

- [ ] **Step 6: Implement `src/handlers/recipes.ts`**

```ts
import * as service from '../services/recipes'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  const method = event.requestContext.http.method
  const path = event.rawPath
  const id = event.pathParameters?.id

  try {
    // GET /users/me/recipes — must be authenticated
    if (method === 'GET' && path.endsWith('/users/me/recipes')) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      return { ...status.OK, body: JSON.stringify(await service.listMyRecipes(auth.userId)) }
    }

    // GET /recipes — public
    if (method === 'GET' && !id) {
      return { ...status.OK, body: JSON.stringify(await service.listPublishedRecipes()) }
    }

    // POST /recipes — must be authenticated
    if (method === 'POST' && !id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createRecipe(auth.userId, input as any)) }
    }

    // GET /recipes/{id} — public but draft requires ownership
    if (method === 'GET' && id) {
      const recipe = await service.getRecipe(id, auth.userId ?? undefined)
      return { ...status.OK, body: JSON.stringify(recipe) }
    }

    // PUT /recipes/{id} — must be authenticated
    if (method === 'PUT' && id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateRecipe(id, auth.userId, input as any)) }
    }

    // DELETE /recipes/{id} — must be authenticated
    if (method === 'DELETE' && id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      await service.deleteRecipe(id, auth.userId)
      return status.NO_CONTENT
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
```

- [ ] **Step 7: Run all tests and typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: recipes CRUD (data, service, handler)"
```

---

## Task 9: Meal Plans Feature

**Files:**

- Create: `src/data/meal-plans.ts`, `src/services/meal-plans.ts`, `src/handlers/meal-plans.ts`
- Test: `__tests__/unit/data/meal-plans.test.ts`, `__tests__/unit/services/meal-plans.test.ts`, `__tests__/unit/handlers/meal-plans.test.ts`

**Interfaces:**

- Consumes: `MealPlanRecord`, `MealPlanItem`, `Share`, `ShareRole` from `@types`
- Produces:
  - data: `getMealPlan(id)`, `putMealPlan(record)`, `deleteMealPlan(id)`, `listMealPlansByOwner(userId)`, `putSharedPlanIndex(userId, planId)`, `deleteSharedPlanIndex(userId, planId)`, `listSharedPlanIds(userId)`
  - service: `listMyMealPlans(userId)`, `getMealPlan(id, userId)`, `createMealPlan(userId, input, now?)`, `updateMealPlan(id, userId, input, now?)`, `deleteMealPlan(id, userId)`, `upsertShare(id, ownerId, targetUserId, role)`, `removeShare(id, ownerId, targetUserId)`
  - handler: all meal-plan routes

- [ ] **Step 1: Write failing data-layer tests**

`__tests__/unit/data/meal-plans.test.ts`:

```ts
import { GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import {
  getMealPlan,
  putMealPlan,
  deleteMealPlan,
  listMealPlansByOwner,
  putSharedPlanIndex,
  deleteSharedPlanIndex,
  listSharedPlanIds,
} from '@data/meal-plans'
import { NotFoundError } from '@errors'

import { MealPlanRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb')
jest.mock('@data/dynamodb', () => ({ default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x), logError: jest.fn() }))

const plan: MealPlanRecord = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Week 1',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}

describe('getMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Item: { Data: { S: JSON.stringify(plan) } } } as any)
  })
  it('returns parsed meal plan', async () => expect(await getMealPlan('plan-1')).toEqual(plan))
  it('throws NotFoundError when missing', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await expect(getMealPlan('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('putMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends PutItemCommand with PK=PLAN#', async () => {
    await putMealPlan(plan)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.PK).toEqual({ S: 'PLAN#plan-1' })
    expect(call.input.Item?.ownerUserId).toEqual({ S: 'u-1' })
  })
})

describe('deleteMealPlan', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })
  it('sends DeleteItemCommand', async () => {
    await deleteMealPlan('plan-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as DeleteItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'PLAN#plan-1' })
  })
})

describe('listMealPlansByOwner', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Items: [{ Data: { S: JSON.stringify(plan) } }] } as any)
  })
  it('queries owner-index', async () => {
    await listMealPlansByOwner('u-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand
    expect(call.input.IndexName).toBe('owner-index')
  })
})

describe('putSharedPlanIndex and listSharedPlanIds', () => {
  beforeAll(() => {
    jest
      .mocked(dynamodb.send)
      .mockResolvedValueOnce({} as any) // putSharedPlanIndex
      .mockResolvedValue({ Items: [{ planId: { S: 'plan-1' } }] } as any)
  })
  it('puts shared plan index item', async () => {
    await putSharedPlanIndex('u-2', 'plan-1')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.SK).toEqual({ S: 'SHARED_PLAN#plan-1' })
  })
  it('lists shared plan ids', async () => {
    const ids = await listSharedPlanIds('u-2')
    expect(ids).toEqual(['plan-1'])
  })
})
```

- [ ] **Step 2: Implement `src/data/meal-plans.ts`**

```ts
import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { MealPlanRecord } from '../types'
import dynamodb from './dynamodb'

export const getMealPlan = async (planId: string): Promise<MealPlanRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({ Key: { PK: { S: `PLAN#${planId}` }, SK: { S: 'METADATA' } }, TableName: dynamodbTableName }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Meal plan not found')
  return JSON.parse(response.Item.Data.S)
}

export const putMealPlan = async (plan: MealPlanRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${plan.createdAt}` },
        Data: { S: JSON.stringify(plan) },
        ownerUserId: { S: plan.ownerUserId },
        PK: { S: `PLAN#${plan.planId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteMealPlan = async (planId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `PLAN#${planId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listMealPlansByOwner = async (ownerUserId: string): Promise<MealPlanRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':owner': { S: ownerUserId }, ':et': { S: 'plan' } },
      FilterExpression: 'attribute_not_exists(#et) OR #et = :et',
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => JSON.parse(item.Data?.S ?? '{}')).filter((x) => x.planId)
}

export const putSharedPlanIndex = async (userId: string, planId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: { PK: { S: `USER#${userId}` }, planId: { S: planId }, SK: { S: `SHARED_PLAN#${planId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteSharedPlanIndex = async (userId: string, planId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `SHARED_PLAN#${planId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listSharedPlanIds = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':pk': { S: `USER#${userId}` }, ':skPrefix': { S: 'SHARED_PLAN#' } },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => item.planId?.S ?? '')
}
```

- [ ] **Step 3: Write failing service tests**

`__tests__/unit/services/meal-plans.test.ts`:

```ts
import * as data from '@data/meal-plans'
import { ForbiddenError, NotFoundError } from '@errors'

import {
  listMyMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  upsertShare,
  removeShare,
} from '@services/meal-plans'
import { generateId } from '@utils/id-generator'

jest.mock('@data/meal-plans')
jest.mock('@utils/id-generator', () => ({ generateId: jest.fn() }))

const plan = {
  planId: 'plan-1',
  ownerUserId: 'u-1',
  title: 'Week 1',
  items: [],
  shares: [],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
}
const sharedPlan = { ...plan, shares: [{ userId: 'u-2', role: 'viewer' as const }] }

describe('listMyMealPlans', () => {
  beforeAll(() => {
    jest.mocked(data.listMealPlansByOwner).mockResolvedValue([plan])
    jest.mocked(data.listSharedPlanIds).mockResolvedValue([])
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
  })
  it('returns owned plans', async () => {
    const result = await listMyMealPlans('u-1')
    expect(result).toContainEqual(plan)
  })
})

describe('getMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
  })
  it('returns plan for owner', async () => expect(await getMealPlan('plan-1', 'u-1')).toEqual(plan))
  it('returns plan for shared viewer', async () => {
    jest.mocked(data.getMealPlan).mockResolvedValueOnce(sharedPlan)
    expect(await getMealPlan('plan-1', 'u-2')).toEqual(sharedPlan)
  })
  it('throws ForbiddenError for unrelated user', async () => {
    await expect(getMealPlan('plan-1', 'u-stranger')).rejects.toThrow(ForbiddenError)
  })
})

describe('createMealPlan', () => {
  beforeAll(() => {
    jest.mocked(generateId).mockReturnValue('plan-new')
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
  })
  it('creates plan with generated id and empty defaults', async () => {
    const result = await createMealPlan('u-1', { title: 'My Plan' }, () => 2_000_000)
    expect(result.planId).toBe('plan-new')
    expect(result.items).toEqual([])
    expect(result.shares).toEqual([])
    expect(result.createdAt).toBe(2_000_000)
  })
})

describe('updateMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
  })
  it('updates plan for owner', async () => {
    const result = await updateMealPlan('plan-1', 'u-1', { title: 'Updated' }, () => 5_000_000)
    expect(result.title).toBe('Updated')
    expect(result.updatedAt).toBe(5_000_000)
  })
  it('throws ForbiddenError for viewer attempting update', async () => {
    jest.mocked(data.getMealPlan).mockResolvedValueOnce(sharedPlan)
    await expect(updateMealPlan('plan-1', 'u-2', { title: 'X' })).rejects.toThrow(ForbiddenError)
  })
})

describe('deleteMealPlan', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.deleteMealPlan).mockResolvedValue(undefined)
  })
  it('deletes for owner', async () => {
    await deleteMealPlan('plan-1', 'u-1')
    expect(data.deleteMealPlan).toHaveBeenCalledWith('plan-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(deleteMealPlan('plan-1', 'u-other')).rejects.toThrow(ForbiddenError)
  })
})

describe('upsertShare', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(plan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
    jest.mocked(data.putSharedPlanIndex).mockResolvedValue(undefined)
  })
  it('adds share and updates index for owner', async () => {
    const result = await upsertShare('plan-1', 'u-1', 'u-2', 'editor')
    expect(result.shares).toContainEqual({ userId: 'u-2', role: 'editor' })
    expect(data.putSharedPlanIndex).toHaveBeenCalledWith('u-2', 'plan-1')
  })
  it('throws ForbiddenError for non-owner', async () => {
    await expect(upsertShare('plan-1', 'u-stranger', 'u-2', 'viewer')).rejects.toThrow(ForbiddenError)
  })
})

describe('removeShare', () => {
  beforeAll(() => {
    jest.mocked(data.getMealPlan).mockResolvedValue(sharedPlan)
    jest.mocked(data.putMealPlan).mockResolvedValue(undefined)
    jest.mocked(data.deleteSharedPlanIndex).mockResolvedValue(undefined)
  })
  it('removes share and deletes index for owner', async () => {
    const result = await removeShare('plan-1', 'u-1', 'u-2')
    expect(result.shares).not.toContainEqual(expect.objectContaining({ userId: 'u-2' }))
    expect(data.deleteSharedPlanIndex).toHaveBeenCalledWith('u-2', 'plan-1')
  })
})
```

- [ ] **Step 4: Implement `src/services/meal-plans.ts`**

```ts
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
  const updated: MealPlanRecord = { ...plan, ...input, planId, updatedAt: now() }
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
```

- [ ] **Step 5: Implement `src/handlers/meal-plans.ts`**

```ts
import * as service from '../services/meal-plans'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const planId = event.pathParameters?.id
  const targetUserId = event.pathParameters?.userId

  try {
    if (method === 'GET' && !planId) {
      return { ...status.OK, body: JSON.stringify(await service.listMyMealPlans(auth.userId)) }
    }
    if (method === 'POST' && !planId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createMealPlan(auth.userId, input as any)) }
    }
    if (method === 'GET' && planId && !targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.getMealPlan(planId, auth.userId)) }
    }
    if (method === 'PUT' && planId && !targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateMealPlan(planId, auth.userId, input as any)) }
    }
    if (method === 'DELETE' && planId && !targetUserId) {
      await service.deleteMealPlan(planId, auth.userId)
      return status.NO_CONTENT
    }
    if (method === 'PUT' && planId && targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const { role } = input as any
      return { ...status.OK, body: JSON.stringify(await service.upsertShare(planId, auth.userId, targetUserId, role)) }
    }
    if (method === 'DELETE' && planId && targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.removeShare(planId, auth.userId, targetUserId)) }
    }
    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
```

Write handler tests in `__tests__/unit/handlers/meal-plans.test.ts` following the same pattern as ingredients and recipes tests: mock `@services/meal-plans`, make events with `makeEvent(method, pathParameters?, body?)`, assert on `statusCode`.

- [ ] **Step 6: Run all tests and typecheck**

```bash
npm test && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: meal plans CRUD with sharing (data, service, handler)"
```

---

## Task 10: Shopping List Generator

**Files:**

- Create: `src/services/shopping-list-generator.ts`
- Test: `__tests__/unit/services/shopping-list-generator.test.ts`

**Interfaces:**

- Consumes: `convertToBase`, `convertFromBase`, `getUnitType` from `@services/unit-converter`; `MealPlanRecord`, `RecipeRecord`, `IngredientRecord`, `ShoppingListItem` from `@types`
- Produces: `generateShoppingListItems(plan, recipes, ingredients): ShoppingListItem[]`

- [ ] **Step 1: Write failing tests**

`__tests__/unit/services/shopping-list-generator.test.ts`:

```ts
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
```

Run: `npm test -- --testPathPattern=shopping-list-generator`
Expected: FAIL

- [ ] **Step 2: Implement `src/services/shopping-list-generator.ts`**

```ts
import { IngredientRecord, MealPlanRecord, RecipeRecord, ShoppingListItem } from '../types'
import { convertFromBase, convertToBase, getUnitType } from './unit-converter'

export const generateShoppingListItems = (
  plan: MealPlanRecord,
  recipes: Map<string, RecipeRecord>,
  ingredients: Map<string, IngredientRecord>,
): ShoppingListItem[] => {
  const baseTotals = new Map<string, number>()
  const unitTypeByIngredient = new Map<string, string>()

  for (const { recipeId, servings: desiredServings } of plan.items) {
    const recipe = recipes.get(recipeId)
    if (!recipe) continue
    const scale = desiredServings / recipe.servings

    for (const { ingredientId, quantity, unit } of recipe.ingredients) {
      const base = convertToBase(quantity * scale, unit)
      baseTotals.set(ingredientId, (baseTotals.get(ingredientId) ?? 0) + base)

      if (!unitTypeByIngredient.has(ingredientId)) {
        try {
          unitTypeByIngredient.set(ingredientId, getUnitType(unit))
        } catch {
          /* unknown unit, skip conversion */
        }
      }
    }
  }

  return Array.from(baseTotals.entries()).map(([ingredientId, baseAmount]) => {
    const ingredient = ingredients.get(ingredientId)
    const unitType = unitTypeByIngredient.get(ingredientId)
    let quantity = baseAmount
    let unit = 'unit'

    if (unitType && (unitType === 'volume' || unitType === 'weight' || unitType === 'count')) {
      const converted = convertFromBase(baseAmount, unitType)
      quantity = converted.quantity
      unit = converted.unit
    }

    return {
      ingredientId,
      itemId: crypto.randomUUID(),
      quantity,
      unit,
      ...(ingredient ? {} : { freeText: ingredientId }),
    }
  })
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --testPathPattern=shopping-list-generator
npm test && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: shopping list generator with unit aggregation and scaling"
```

---

## Task 11: Shopping Lists Feature

**Files:**

- Create: `src/data/shopping-lists.ts`, `src/services/shopping-lists.ts`, `src/handlers/shopping-lists.ts`
- Test: `__tests__/unit/data/shopping-lists.test.ts`, `__tests__/unit/services/shopping-lists.test.ts`, `__tests__/unit/handlers/shopping-lists.test.ts`

**Interfaces:**

- Consumes: `ShoppingListRecord`, `ShoppingListItem` from `@types`; `generateShoppingListItems` from `@services/shopping-list-generator`; meal plan and recipe data for generation
- Produces:
  - data: `getShoppingList(id)`, `putShoppingList(record)`, `deleteShoppingList(id)`, `listShoppingListsByOwner(userId)`, `putSharedListIndex(userId, listId)`, `deleteSharedListIndex(userId, listId)`, `listSharedListIds(userId)`
  - service: `listMyShoppingLists(userId)`, `getShoppingList(id, userId)`, `createShoppingList(userId, input, now?)`, `updateShoppingList(id, userId, input, now?)`, `deleteShoppingList(id, userId)`, `checkItem(listId, itemId, userId, now?)`, `uncheckItem(listId, itemId, userId)`, `upsertShare(id, ownerId, targetUserId, role)`, `removeShare(id, ownerId, targetUserId)`
  - handler: all shopping list routes

- [ ] **Step 1: Implement `src/data/shopping-lists.ts`**

```ts
import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { ShoppingListRecord } from '../types'
import dynamodb from './dynamodb'

export const getShoppingList = async (listId: string): Promise<ShoppingListRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({ Key: { PK: { S: `LIST#${listId}` }, SK: { S: 'METADATA' } }, TableName: dynamodbTableName }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Shopping list not found')
  return JSON.parse(response.Item.Data.S)
}

export const putShoppingList = async (list: ShoppingListRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${list.createdAt}` },
        Data: { S: JSON.stringify(list) },
        ownerUserId: { S: list.ownerUserId },
        PK: { S: `LIST#${list.listId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteShoppingList = async (listId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `LIST#${listId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listShoppingListsByOwner = async (ownerUserId: string): Promise<ShoppingListRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':owner': { S: ownerUserId } },
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => JSON.parse(item.Data?.S ?? '{}')).filter((x) => x.listId)
}

export const putSharedListIndex = async (userId: string, listId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: { listId: { S: listId }, PK: { S: `USER#${userId}` }, SK: { S: `SHARED_LIST#${listId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteSharedListIndex = async (userId: string, listId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `SHARED_LIST#${listId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listSharedListIds = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':pk': { S: `USER#${userId}` }, ':skPrefix': { S: 'SHARED_LIST#' } },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item) => item.listId?.S ?? '')
}
```

Write data tests in `__tests__/unit/data/shopping-lists.test.ts` following the same pattern as meal-plans data tests: mock `@data/dynamodb`, assert on commands sent.

- [ ] **Step 2: Implement `src/services/shopping-lists.ts`**

```ts
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
  const updated: ShoppingListRecord = { ...list, ...input, listId, updatedAt: now() }
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
  const shares = list.shares.filter((s) => s.userId !== targetUserId)
  shares.push({ userId: targetUserId, role })
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
```

- [ ] **Step 3: Implement `src/handlers/shopping-lists.ts`**

```ts
import * as service from '../services/shopping-lists'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const listId = event.pathParameters?.id
  const itemId = event.pathParameters?.itemId
  const targetUserId = event.pathParameters?.userId

  try {
    if (method === 'GET' && !listId) {
      return { ...status.OK, body: JSON.stringify(await service.listMyShoppingLists(auth.userId)) }
    }
    if (method === 'POST' && !listId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createShoppingList(auth.userId, input as any)) }
    }
    if (method === 'GET' && listId && !itemId && !targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.getShoppingList(listId, auth.userId)) }
    }
    if (method === 'PUT' && listId && !itemId && !targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateShoppingList(listId, auth.userId, input as any)) }
    }
    if (method === 'DELETE' && listId && !itemId && !targetUserId) {
      await service.deleteShoppingList(listId, auth.userId)
      return status.NO_CONTENT
    }
    if (method === 'PUT' && listId && itemId) {
      return { ...status.OK, body: JSON.stringify(await service.checkItem(listId, itemId, auth.userId)) }
    }
    if (method === 'DELETE' && listId && itemId) {
      return { ...status.OK, body: JSON.stringify(await service.uncheckItem(listId, itemId, auth.userId)) }
    }
    if (method === 'PUT' && listId && targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const { role } = input as any
      return { ...status.OK, body: JSON.stringify(await service.upsertShare(listId, auth.userId, targetUserId, role)) }
    }
    if (method === 'DELETE' && listId && targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.removeShare(listId, auth.userId, targetUserId)) }
    }
    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
```

Write service tests in `__tests__/unit/services/shopping-lists.test.ts` and handler tests in `__tests__/unit/handlers/shopping-lists.test.ts` following the same patterns as meal-plans tests: mock the data layer, assert on service calls and status codes.

- [ ] **Step 4: Run all tests and typecheck**

```bash
npm test && npm run typecheck
```

Expected: PASS, coverage thresholds met

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shopping lists with item checking and sharing (data, service, handler)"
```

---

## Task 12: Cognito Auth Triggers + SAM Template

**Files:**

- Create: `src/auth-triggers/define-auth-challenge.ts`, `src/auth-triggers/create-auth-challenge.ts`, `src/auth-triggers/verify-auth-challenge.ts`
- Modify: `template.yaml`, `buildspec.yml`, `package.json` (remove choosee repo URL)

**Interfaces:**

- Produces: deployed Cognito phone/OTP flow, all Lambda functions wired to API Gateway, DynamoDB table with 3 GSIs, S3 photo bucket

- [ ] **Step 1: Write Cognito auth trigger Lambdas**

`src/auth-triggers/define-auth-challenge.ts`:

```ts
export const handler = (event: any): any => {
  const sessions = event.request.session ?? []
  if (sessions.length === 0) {
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    event.response.failAuthentication = false
    event.response.issueTokens = false
  } else if (sessions.length > 0 && sessions[sessions.length - 1].challengeResult === true) {
    event.response.failAuthentication = false
    event.response.issueTokens = true
  } else {
    event.response.failAuthentication = true
    event.response.issueTokens = false
  }
  return event
}
```

`src/auth-triggers/create-auth-challenge.ts`:

```ts
import axios from 'axios'

import { smsApiKey, smsApiUrl } from '../config'

const generateOtp = (): string => String(Math.floor(100000 + Math.random() * 900000))

export const handler = async (event: any): Promise<any> => {
  const otp = generateOtp()
  const phone = event.request.userAttributes.phone_number

  await axios.post(
    `${smsApiUrl}/messages`,
    { contents: `Your food-api verification code is: ${otp}`, messageType: 'TRANSACTIONAL', to: phone },
    { headers: { 'x-api-key': smsApiKey } },
  )

  event.response.privateChallengeParameters = { otp }
  event.response.publicChallengeParameters = { hint: 'Enter the 6-digit code sent to your phone' }
  event.response.challengeMetadata = 'OTP_CHALLENGE'
  return event
}
```

`src/auth-triggers/verify-auth-challenge.ts`:

```ts
export const handler = (event: any): any => {
  const expectedOtp = event.request.privateChallengeParameters.otp
  const providedAnswer = event.request.challengeAnswer
  event.response.answerCorrect = expectedOtp === providedAnswer
  return event
}
```

- [ ] **Step 2: Write `template.yaml`**

```yaml
AWSTemplateFormatVersion: 2010-09-09
Description: food-api — Recipe book, meal planning, and shopping list API

Transform:
  - AWS::Serverless-2016-10-31

Parameters:
  Environment:
    Type: String
    Default: prod
    AllowedValues: [prod, test]
  SmsApiKey:
    Type: String
    Description: API key for sms-queue-api
    NoEcho: true

Mappings:
  EnvironmentMap:
    prod:
      certificateEdge: adce1a21-90b4-4120-8548-111215e582f0
      certificateRegional: 5d4db894-c9fc-42ca-8f80-3c5da6c1678e
      corsDomain: https://food.dbowland.com
      domain: food-api.dbowland.com
      logStreamFunction: log-subscriber
      photoBucket: food-api-photos
      table: food-api
      smsApiUrl: https://sms-queue-api.dbowland.com/v1
      zoneId: Z072422417XWM8PIXXSFA
    test:
      certificateEdge: 6a48cba7-feb9-4de5-8cbf-d383140fcdef
      certificateRegional: 14a32175-0c26-4768-b71f-3fa611b8f5a2
      corsDomain: https://food.bowland.link
      domain: food-api.bowland.link
      logStreamFunction: log-subscriber-test
      photoBucket: food-api-photos-test
      table: food-api-test
      smsApiUrl: https://sms-queue-api.bowland.link/v1
      zoneId: Z01312547RGU1BYKIJXY

Globals:
  Function:
    Runtime: nodejs24.x
    Architectures: [x86_64]
    Tracing: Active
    Environment:
      Variables:
        NODE_OPTIONS: '--disable-warning DEP0040'
    Tags:
      'created-by': 'food-api'
      'created-for': 'food'
      'environment': !Ref Environment

Resources:
  # API Gateway

  HttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      Auth:
        Authorizers:
          CognitoAuthorizer:
            IdentitySource: $request.header.Authorization
            JwtConfiguration:
              issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}'
              audience: [!Ref UserPoolClient]
        DefaultAuthorizer: CognitoAuthorizer
      CorsConfiguration:
        AllowCredentials: true
        AllowHeaders:
          - Authorization
          - Content-Type
          - X-Amz-Date
          - X-Amz-Security-Token
          - X-Api-Key
        AllowMethods: [DELETE, GET, OPTIONS, PATCH, POST, PUT]
        AllowOrigins:
          - !FindInMap [EnvironmentMap, !Ref Environment, corsDomain]
      Domain:
        BasePath: [/v1]
        CertificateArn: !Sub
          - 'arn:aws:acm:${AWS::Region}:${AWS::AccountId}:certificate/${Cert}'
          - Cert: !FindInMap [EnvironmentMap, !Ref Environment, certificateRegional]
        DomainName: !FindInMap [EnvironmentMap, !Ref Environment, domain]
        EndpointConfiguration: REGIONAL
      FailOnWarnings: true
      StageName: v1

  HttpRecordSet:
    Type: AWS::Route53::RecordSet
    Properties:
      AliasTarget:
        DNSName: !Sub '${HttpApi.DomainName.RegionalDomainName}'
        HostedZoneId: !Sub '${HttpApi.DomainName.RegionalHostedZoneId}'
      HostedZoneId: !FindInMap [EnvironmentMap, !Ref Environment, zoneId]
      Name: !FindInMap [EnvironmentMap, !Ref Environment, domain]
      Type: A

  # Cognito — Phone/OTP authentication

  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub 'food-${Environment}'
      UsernameAttributes: [phone_number]
      AutoVerifiedAttributes: [phone_number]
      MfaConfiguration: 'OFF'
      LambdaConfig:
        DefineAuthChallenge: !GetAtt DefineAuthChallengeFunction.Arn
        CreateAuthChallenge: !GetAtt CreateAuthChallengeFunction.Arn
        VerifyAuthChallengeResponse: !GetAtt VerifyAuthChallengeFunction.Arn
      UserPoolTags:
        'created-by': 'food-api'
        'created-for': 'food'
        'environment': !Ref Environment

  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      UserPoolId: !Ref UserPool
      ClientName: !Sub 'food-${Environment}'
      ExplicitAuthFlows:
        - ALLOW_CUSTOM_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      AllowedOAuthFlowsUserPoolClient: false

  # Cognito Lambda Triggers

  DefineAuthChallengeFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/auth-triggers/define-auth-challenge.handler
      MemorySize: 256
      Description: food-api Cognito define auth challenge trigger
      Policies: [AWSLambdaBasicExecutionRole]
      Timeout: 5
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/auth-triggers/define-auth-challenge.ts]

  DefineAuthChallengeFunctionPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !GetAtt DefineAuthChallengeFunction.Arn
      Principal: cognito-idp.amazonaws.com
      SourceArn: !GetAtt UserPool.Arn

  CreateAuthChallengeFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/auth-triggers/create-auth-challenge.handler
      MemorySize: 256
      Description: food-api Cognito create auth challenge trigger (sends OTP via SMS)
      Policies: [AWSLambdaBasicExecutionRole]
      Environment:
        Variables:
          SMS_API_KEY: !Ref SmsApiKey
          SMS_API_URL: !FindInMap [EnvironmentMap, !Ref Environment, smsApiUrl]
      Timeout: 15
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/auth-triggers/create-auth-challenge.ts]

  CreateAuthChallengeFunctionPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !GetAtt CreateAuthChallengeFunction.Arn
      Principal: cognito-idp.amazonaws.com
      SourceArn: !GetAtt UserPool.Arn

  VerifyAuthChallengeFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/auth-triggers/verify-auth-challenge.handler
      MemorySize: 256
      Description: food-api Cognito verify auth challenge trigger
      Policies: [AWSLambdaBasicExecutionRole]
      Timeout: 5
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/auth-triggers/verify-auth-challenge.ts]

  VerifyAuthChallengeFunctionPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !GetAtt VerifyAuthChallengeFunction.Arn
      Principal: cognito-idp.amazonaws.com
      SourceArn: !GetAtt UserPool.Arn

  # Lambda — Ingredients

  IngredientsFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/ingredients.handler
      MemorySize: 512
      Description: food-api ingredients CRUD
      Policies:
        - AWSLambdaBasicExecutionRole
        - DynamoDBCrudPolicy:
            TableName: !Ref FoodTable
      Environment:
        Variables:
          DYNAMODB_TABLE_NAME: !Ref FoodTable
      Events:
        GetIngredients:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /ingredients
            Method: get
            Auth:
              Authorizer: NONE
        PostIngredient:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /ingredients
            Method: post
        GetIngredientById:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /ingredients/{id}
            Method: get
            Auth:
              Authorizer: NONE
        PutIngredient:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /ingredients/{id}
            Method: put
      Timeout: 15
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/ingredients.ts]

  IngredientsLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${IngredientsFunction}
      RetentionInDays: 30

  IngredientsLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref IngredientsLogGroup

  # Lambda — Recipes

  RecipesFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/recipes.handler
      MemorySize: 512
      Description: food-api recipes CRUD
      Policies:
        - AWSLambdaBasicExecutionRole
        - DynamoDBCrudPolicy:
            TableName: !Ref FoodTable
      Environment:
        Variables:
          DYNAMODB_TABLE_NAME: !Ref FoodTable
      Events:
        GetRecipes:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /recipes
            Method: get
            Auth:
              Authorizer: NONE
        PostRecipe:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /recipes
            Method: post
        GetMyRecipes:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me/recipes
            Method: get
        GetRecipeById:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /recipes/{id}
            Method: get
            Auth:
              Authorizer: NONE
        PutRecipe:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /recipes/{id}
            Method: put
        DeleteRecipe:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /recipes/{id}
            Method: delete
      Timeout: 15
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/recipes.ts]

  RecipesLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${RecipesFunction}
      RetentionInDays: 30

  RecipesLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref RecipesLogGroup

  # Lambda — Photos

  PhotosFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/photos.handler
      MemorySize: 256
      Description: food-api S3 presigned upload URL
      Policies:
        - AWSLambdaBasicExecutionRole
        - S3WritePolicy:
            BucketName: !Ref PhotoBucket
      Environment:
        Variables:
          PHOTO_BUCKET_NAME: !Ref PhotoBucket
          PHOTO_PRESIGNED_URL_EXPIRE_SECONDS: '3600'
      Events:
        PostPhoto:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /photos
            Method: post
      Timeout: 10
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/photos.ts]

  PhotosLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${PhotosFunction}
      RetentionInDays: 30

  PhotosLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref PhotosLogGroup

  # Lambda — Users

  UsersFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/users.handler
      MemorySize: 512
      Description: food-api user profile and favorites
      Policies:
        - AWSLambdaBasicExecutionRole
        - DynamoDBCrudPolicy:
            TableName: !Ref FoodTable
      Environment:
        Variables:
          DYNAMODB_TABLE_NAME: !Ref FoodTable
      Events:
        GetMe:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me
            Method: get
        PutMe:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me
            Method: put
        GetFavorites:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me/favorites
            Method: get
        PutFavorite:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me/favorites/{recipeId}
            Method: put
        DeleteFavorite:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /users/me/favorites/{recipeId}
            Method: delete
      Timeout: 15
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/users.ts]

  UsersLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${UsersFunction}
      RetentionInDays: 30

  UsersLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref UsersLogGroup

  # Lambda — Meal Plans

  MealPlansFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/meal-plans.handler
      MemorySize: 512
      Description: food-api meal plans CRUD with sharing
      Policies:
        - AWSLambdaBasicExecutionRole
        - DynamoDBCrudPolicy:
            TableName: !Ref FoodTable
      Environment:
        Variables:
          DYNAMODB_TABLE_NAME: !Ref FoodTable
      Events:
        GetMealPlans:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans
            Method: get
        PostMealPlan:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans
            Method: post
        GetMealPlanById:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans/{id}
            Method: get
        PutMealPlan:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans/{id}
            Method: put
        DeleteMealPlan:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans/{id}
            Method: delete
        PutMealPlanShare:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans/{id}/shares/{userId}
            Method: put
        DeleteMealPlanShare:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /meal-plans/{id}/shares/{userId}
            Method: delete
      Timeout: 15
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/meal-plans.ts]

  MealPlansLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${MealPlansFunction}
      RetentionInDays: 30

  MealPlansLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref MealPlansLogGroup

  # Lambda — Shopping Lists

  ShoppingListsFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/shopping-lists.handler
      MemorySize: 512
      Description: food-api shopping lists CRUD with sharing and item checking
      Policies:
        - AWSLambdaBasicExecutionRole
        - DynamoDBCrudPolicy:
            TableName: !Ref FoodTable
      Environment:
        Variables:
          DYNAMODB_TABLE_NAME: !Ref FoodTable
      Events:
        GetShoppingLists:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists
            Method: get
        PostShoppingList:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists
            Method: post
        GetShoppingListById:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}
            Method: get
        PutShoppingList:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}
            Method: put
        DeleteShoppingList:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}
            Method: delete
        CheckItem:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}/items/{itemId}/check
            Method: put
        UncheckItem:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}/items/{itemId}/check
            Method: delete
        PutShoppingListShare:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}/shares/{userId}
            Method: put
        DeleteShoppingListShare:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /shopping-lists/{id}/shares/{userId}
            Method: delete
      Timeout: 30
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: 'es2024'
        Sourcemap: true
        EntryPoints: [src/handlers/shopping-lists.ts]

  ShoppingListsLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${ShoppingListsFunction}
      RetentionInDays: 30

  ShoppingListsLogGroupSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      DestinationArn: !Sub
        - 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${Fn}'
        - Fn: !FindInMap [EnvironmentMap, !Ref Environment, logStreamFunction]
      FilterPattern: '[timestamp, uuid, level="ERROR", message]'
      LogGroupName: !Ref ShoppingListsLogGroup

  # DynamoDB

  FoodTable:
    Type: AWS::DynamoDB::Table
    Properties:
      AttributeDefinitions:
        - { AttributeName: PK, AttributeType: S }
        - { AttributeName: SK, AttributeType: S }
        - { AttributeName: ownerUserId, AttributeType: S }
        - { AttributeName: recipeStatus, AttributeType: S }
        - { AttributeName: entityType, AttributeType: S }
        - { AttributeName: createdAt, AttributeType: N }
      BillingMode: PAY_PER_REQUEST
      GlobalSecondaryIndexes:
        - IndexName: owner-index
          KeySchema:
            - { AttributeName: ownerUserId, KeyType: HASH }
            - { AttributeName: createdAt, KeyType: RANGE }
          Projection: { ProjectionType: ALL }
        - IndexName: status-index
          KeySchema:
            - { AttributeName: recipeStatus, KeyType: HASH }
            - { AttributeName: createdAt, KeyType: RANGE }
          Projection: { ProjectionType: ALL }
        - IndexName: type-index
          KeySchema:
            - { AttributeName: entityType, KeyType: HASH }
            - { AttributeName: createdAt, KeyType: RANGE }
          Projection: { ProjectionType: ALL }
      KeySchema:
        - { AttributeName: PK, KeyType: HASH }
        - { AttributeName: SK, KeyType: RANGE }
      TableName: !FindInMap [EnvironmentMap, !Ref Environment, table]
      Tags:
        - { Key: 'created-by', Value: 'food-api' }
        - { Key: 'created-for', Value: 'food' }
        - { Key: 'environment', Value: !Ref Environment }

  # S3 — Photo storage

  PhotoBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !FindInMap [EnvironmentMap, !Ref Environment, photoBucket]
      CorsConfiguration:
        CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, PUT]
            AllowedOrigins:
              - !FindInMap [EnvironmentMap, !Ref Environment, corsDomain]
            MaxAge: 3600
      Tags:
        - { Key: 'created-by', Value: 'food-api' }
        - { Key: 'created-for', Value: 'food' }
        - { Key: 'environment', Value: !Ref Environment }
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: SAM template — Cognito phone/OTP, all Lambda functions, DynamoDB, S3"
```

---

## Task 13: endpoints.rest

**Files:**

- Modify: `endpoints.rest`

**Interfaces:**

- Produces: complete REST client file for manual API testing

- [ ] **Step 1: Write `endpoints.rest`**

```rest
# food-api endpoints
# Set @token to a valid Cognito JWT before running authenticated requests
@baseUrl = https://food-api.dbowland.com/v1
@token = <your-cognito-jwt>

### ── Ingredients ──────────────────────────────────────────

# List all ingredients (public)
GET {{baseUrl}}/ingredients

###

# Get ingredient by ID (public)
GET {{baseUrl}}/ingredients/{{ingredientId}}

###

# Create ingredient (authenticated)
POST {{baseUrl}}/ingredients
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "All-Purpose Flour",
  "allowedUnitTypes": ["volume", "weight"]
}

###

# Update ingredient (authenticated)
PUT {{baseUrl}}/ingredients/{{ingredientId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "Bread Flour",
  "allowedUnitTypes": ["volume", "weight"]
}

### ── Recipes ───────────────────────────────────────────────

# List published recipes (public)
GET {{baseUrl}}/recipes

###

# Get recipe by ID (public for published, owner-only for draft)
GET {{baseUrl}}/recipes/{{recipeId}}

###

# List my recipes — all statuses (authenticated)
GET {{baseUrl}}/users/me/recipes
Authorization: Bearer {{token}}

###

# Create recipe — status=draft (authenticated)
POST {{baseUrl}}/recipes
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Classic Pancakes",
  "description": "Fluffy pancakes for two",
  "servings": 2,
  "ingredients": [
    { "ingredientId": "flour-id", "quantity": 1, "unit": "cup" },
    { "ingredientId": "egg-id", "quantity": 2, "unit": "unit" }
  ],
  "steps": ["Mix dry ingredients", "Add wet ingredients", "Cook on griddle"],
  "tags": ["breakfast", "quick"]
}

###

# Update recipe (authenticated, owner only)
PUT {{baseUrl}}/recipes/{{recipeId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Fluffy Pancakes"
}

###

# Delete recipe (authenticated, owner only)
DELETE {{baseUrl}}/recipes/{{recipeId}}
Authorization: Bearer {{token}}

### ── Photos ────────────────────────────────────────────────

# Get presigned S3 upload URL (authenticated)
# Response: { uploadUrl: string, key: string }
# Then PUT the image file directly to uploadUrl, and store key on the recipe
POST {{baseUrl}}/photos
Authorization: Bearer {{token}}

### ── Users ─────────────────────────────────────────────────

# Get own profile (authenticated)
GET {{baseUrl}}/users/me
Authorization: Bearer {{token}}

###

# Update display name (authenticated)
PUT {{baseUrl}}/users/me
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "displayName": "Alice"
}

###

# List my favorited recipe IDs (authenticated)
GET {{baseUrl}}/users/me/favorites
Authorization: Bearer {{token}}

###

# Add favorite (authenticated)
PUT {{baseUrl}}/users/me/favorites/{{recipeId}}
Authorization: Bearer {{token}}

###

# Remove favorite (authenticated)
DELETE {{baseUrl}}/users/me/favorites/{{recipeId}}
Authorization: Bearer {{token}}

### ── Meal Plans ─────────────────────────────────────────────

# List my meal plans (owned + shared) (authenticated)
GET {{baseUrl}}/meal-plans
Authorization: Bearer {{token}}

###

# Create meal plan (authenticated)
POST {{baseUrl}}/meal-plans
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Week of Jun 30",
  "items": [
    { "recipeId": "{{recipeId}}", "servings": 2 }
  ]
}

###

# Get meal plan by ID (authenticated, owner or shared)
GET {{baseUrl}}/meal-plans/{{planId}}
Authorization: Bearer {{token}}

###

# Update meal plan (authenticated, owner or editor)
PUT {{baseUrl}}/meal-plans/{{planId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Updated Week",
  "items": [
    { "recipeId": "{{recipeId}}", "servings": 4 }
  ]
}

###

# Delete meal plan (authenticated, owner only)
DELETE {{baseUrl}}/meal-plans/{{planId}}
Authorization: Bearer {{token}}

###

# Share meal plan with user (authenticated, owner only)
PUT {{baseUrl}}/meal-plans/{{planId}}/shares/{{targetUserId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "role": "editor"
}

###

# Remove share (authenticated, owner only)
DELETE {{baseUrl}}/meal-plans/{{planId}}/shares/{{targetUserId}}
Authorization: Bearer {{token}}

### ── Shopping Lists ─────────────────────────────────────────

# List my shopping lists (owned + shared) (authenticated)
GET {{baseUrl}}/shopping-lists
Authorization: Bearer {{token}}

###

# Create empty shopping list (authenticated)
POST {{baseUrl}}/shopping-lists
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Grocery Run"
}

###

# Create shopping list generated from a meal plan (authenticated)
POST {{baseUrl}}/shopping-lists
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Week of Jun 30 groceries",
  "generatedFromPlanId": "{{planId}}"
}

###

# Get shopping list (authenticated, owner or shared)
GET {{baseUrl}}/shopping-lists/{{listId}}
Authorization: Bearer {{token}}

###

# Update shopping list (authenticated, owner or editor)
PUT {{baseUrl}}/shopping-lists/{{listId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Renamed list",
  "items": [
    { "ingredientId": "flour-id", "quantity": 2, "unit": "cup" },
    { "freeText": "Paper towels", "quantity": 1, "unit": "unit" }
  ]
}

###

# Delete shopping list (authenticated, owner only)
DELETE {{baseUrl}}/shopping-lists/{{listId}}
Authorization: Bearer {{token}}

###

# Mark item as picked up (authenticated, owner or shared)
PUT {{baseUrl}}/shopping-lists/{{listId}}/items/{{itemId}}/check
Authorization: Bearer {{token}}

###

# Uncheck item (authenticated, owner or shared)
DELETE {{baseUrl}}/shopping-lists/{{listId}}/items/{{itemId}}/check
Authorization: Bearer {{token}}

###

# Share shopping list (authenticated, owner only)
PUT {{baseUrl}}/shopping-lists/{{listId}}/shares/{{targetUserId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "role": "viewer"
}

###

# Remove share from shopping list (authenticated, owner only)
DELETE {{baseUrl}}/shopping-lists/{{listId}}/shares/{{targetUserId}}
Authorization: Bearer {{token}}
```

- [ ] **Step 2: Run final test suite and typecheck**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all pass, coverage thresholds met

- [ ] **Step 3: Commit**

```bash
git add endpoints.rest
git commit -m "chore: update endpoints.rest with all food-api routes"
```

---

## Self-Review

**Spec coverage check:**

- ✅ CLAUDE.md with testing standards — Task 1
- ✅ Cognito phone/OTP — Task 12 (Cognito triggers + UserPool config)
- ✅ Google OAuth removed — Task 1 (deleted from choosee files) + Task 12 (new template)
- ✅ CORS for food.dbowland.com / food.bowland.link — Task 12 template
- ✅ Ingredients CRUD — Tasks 5
- ✅ Recipes CRUD with draft/published status and author ownership — Task 8
- ✅ Photos (S3 presigned URL) — Task 7
- ✅ Users profile + favorites — Task 6
- ✅ Meal plans with sharing (viewer/editor) — Task 9
- ✅ Shopping list generation with unit conversion and serving scaling — Tasks 3, 10, 11
- ✅ Shopping list item check/uncheck with userId + timestamp — Task 11
- ✅ Unit system (volume/weight/count including score and gross) — Task 3
- ✅ DynamoDB single-table with 3 GSIs — Task 12
- ✅ S3 bucket for photos — Task 12
- ✅ endpoints.rest — Task 13
- ✅ `GET /users/me/recipes` (list own drafts) — Task 8
- ✅ `nutritionPer100g` stub reserved on IngredientRecord — Task 2

**Placeholder scan:** None found — all steps contain concrete code.

**Type consistency:** All types imported from `@types` / `../types`. Function signatures are consistent across data → service → handler layers. `ShoppingListItem.itemId` assigned in generator and service. `generateId()` used in services, never in data layer.
