import { AdminGetUserCommand, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider'
import { PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import cognito from '@data/cognito'
import dynamodb from '@data/dynamodb'
import { getUser, putUser, addFavorite, removeFavorite, listFavorites, getUserIdByPhone } from '@data/users'
import { NotFoundError } from '@errors'

import { UserRecord } from '@types'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@aws-sdk/client-cognito-identity-provider', () =>
  jest.requireActual('@aws-sdk/client-cognito-identity-provider'),
)
jest.mock('@data/cognito', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
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

  it('returns empty string for items with no recipeId S value', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [{}] } as any)
    expect(await listFavorites('u-1')).toEqual([''])
  })
})

describe('getUserIdByPhone', () => {
  const cognitoResponse = { UserAttributes: [{ Name: 'sub', Value: 'u-1' }] }

  beforeAll(() => {
    jest.mocked(cognito.send).mockResolvedValue(cognitoResponse as any)
  })

  it('returns userId (sub) for known phone', async () => {
    expect(await getUserIdByPhone('+15551234567')).toBe('u-1')
    const call = jest.mocked(cognito.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(AdminGetUserCommand)
  })

  it('throws NotFoundError when sub attribute is absent', async () => {
    jest.mocked(cognito.send).mockResolvedValueOnce({ UserAttributes: [] } as any)
    await expect(getUserIdByPhone('+15551234567')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError for UserNotFoundException', async () => {
    jest.mocked(cognito.send).mockRejectedValueOnce(new UserNotFoundException({ message: 'not found', $metadata: {} }))
    await expect(getUserIdByPhone('+15551234567')).rejects.toThrow(NotFoundError)
  })

  it('re-throws unexpected errors', async () => {
    jest.mocked(cognito.send).mockRejectedValueOnce(new Error('network error'))
    await expect(getUserIdByPhone('+15551234567')).rejects.toThrow('network error')
  })
})
