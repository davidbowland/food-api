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
