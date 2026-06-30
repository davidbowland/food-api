import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { deleteSends, getSends, globalRateLimitKey, phoneRateLimitKey, putSends } from '@data/rate-limit'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x) }))

const nowMs = 1_720_000_000_000
const recentMs = nowMs - 1_000
const staleMs = nowMs - 3_600_001

describe('getSends', () => {
  it('returns empty array when no record exists', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    expect(await getSends('RATE#GLOBAL', nowMs)).toEqual([])
  })

  it('returns empty array when sends field is absent', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: {} } as any)
    expect(await getSends('RATE#GLOBAL', nowMs)).toEqual([])
  })

  it('filters out sends older than 1 hour', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({
      Item: { sends: { S: JSON.stringify([staleMs, recentMs, nowMs - 1]) } },
    } as any)
    const result = await getSends('RATE#GLOBAL', nowMs)
    expect(result).toEqual([recentMs, nowMs - 1])
  })

  it('sends GetItemCommand with correct key', async () => {
    jest.mocked(dynamodb.send).mockResolvedValueOnce({ Item: undefined } as any)
    await getSends('RATE#PHONE#+15551234567', nowMs)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(GetItemCommand)
    expect((call as GetItemCommand).input.Key?.PK).toEqual({ S: 'RATE#PHONE#+15551234567' })
    expect((call as GetItemCommand).input.Key?.SK).toEqual({ S: 'RATE' })
  })
})

describe('putSends', () => {
  const sends = [nowMs - 1000, nowMs]
  const expectedTtl = Math.floor(nowMs / 1000) + 3600 + 300

  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends PutItemCommand with serialised sends and TTL', async () => {
    await putSends('RATE#GLOBAL', sends, nowMs)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call).toBeInstanceOf(PutItemCommand)
    expect(JSON.parse(call.input.Item?.sends?.S ?? '')).toEqual(sends)
    expect(call.input.Item?.ttl).toEqual({ N: `${expectedTtl}` })
  })

  it('uses the provided PK', async () => {
    await putSends('RATE#PHONE#+15551234567', sends, nowMs)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as PutItemCommand
    expect(call.input.Item?.PK).toEqual({ S: 'RATE#PHONE#+15551234567' })
  })
})

describe('deleteSends', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with RATE SK', async () => {
    await deleteSends('RATE#PHONE#+15551234567')
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(DeleteItemCommand)
    expect((call as DeleteItemCommand).input.Key?.PK).toEqual({ S: 'RATE#PHONE#+15551234567' })
    expect((call as DeleteItemCommand).input.Key?.SK).toEqual({ S: 'RATE' })
  })
})

describe('phoneRateLimitKey', () => {
  it('namespaces by phone', () => {
    expect(phoneRateLimitKey('+15551234567')).toBe('RATE#PHONE#+15551234567')
  })
})

describe('globalRateLimitKey', () => {
  it('is a fixed string', () => {
    expect(globalRateLimitKey).toBe('RATE#GLOBAL')
  })
})
