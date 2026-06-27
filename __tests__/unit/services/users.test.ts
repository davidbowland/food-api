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

  it('re-throws non-NotFoundError errors', async () => {
    jest.mocked(data.getUser).mockRejectedValueOnce(new Error('connection error'))
    await expect(getOrCreateUser('u-1', '+15551234567')).rejects.toThrow('connection error')
  })
})

describe('updateUser', () => {
  beforeAll(() => {
    jest.mocked(data.getUser).mockResolvedValue(user)
    jest.mocked(data.putUser).mockResolvedValue(undefined)
  })

  it('merges displayName update', async () => {
    const result = await updateUser('u-1', { displayName: 'Bob' })
    expect(result.displayName).toBe('Bob')
    expect(result.createdAt).toBe(1_000_000)
  })
  it('does not allow userId to be overwritten', async () => {
    const result = await updateUser('u-1', { userId: 'attacker' } as any)
    expect(result.userId).toBe('u-1')
  })
  it('does not allow phone to be overwritten', async () => {
    const result = await updateUser('u-1', { phone: '+15550000000' } as any)
    expect(result.phone).toBe('+15551234567')
  })
  it('does not allow createdAt to be overwritten', async () => {
    const result = await updateUser('u-1', { createdAt: 0 } as any)
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
