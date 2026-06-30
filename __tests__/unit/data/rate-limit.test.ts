import { DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import dynamodb from '@data/dynamodb'
import { deleteRateLimit, globalRateLimitKey, incrementCount, phoneRateLimitKey } from '@data/rate-limit'

jest.mock('@aws-sdk/client-dynamodb', () => jest.requireActual('@aws-sdk/client-dynamodb'))
jest.mock('@data/dynamodb', () => ({ __esModule: true, default: { send: jest.fn() } }))
jest.mock('@utils/logging', () => ({ xrayCapture: jest.fn((x: unknown) => x) }))

const nowMs = 1_720_000_000_000
const nowFn = () => nowMs
const expectedTtl = Math.floor(nowMs / 1000) + 3600

describe('incrementCount', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({ Attributes: { count: { N: '5' } } } as any)
  })

  it('returns the new count', async () => {
    expect(await incrementCount('RATE#GLOBAL', nowFn)).toBe(5)
  })

  it('sends UpdateItemCommand with ADD expression', async () => {
    await incrementCount('RATE#GLOBAL', nowFn)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0]
    expect(call).toBeInstanceOf(UpdateItemCommand)
    expect((call as UpdateItemCommand).input.UpdateExpression).toContain('ADD #count :one')
  })

  it('sets TTL only if not already present', async () => {
    await incrementCount('RATE#GLOBAL', nowFn)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as UpdateItemCommand
    expect(call.input.UpdateExpression).toContain('if_not_exists(#ttl, :expiry)')
    expect(call.input.ExpressionAttributeValues?.[':expiry']).toEqual({ N: `${expectedTtl}` })
  })

  it('uses provided PK as key', async () => {
    await incrementCount('RATE#PHONE#+15551234567', nowFn)
    const call = jest.mocked(dynamodb.send).mock.calls[0][0] as UpdateItemCommand
    expect(call.input.Key?.PK).toEqual({ S: 'RATE#PHONE#+15551234567' })
  })
})

describe('deleteRateLimit', () => {
  beforeAll(() => {
    jest.mocked(dynamodb.send).mockResolvedValue({} as any)
  })

  it('sends DeleteItemCommand with RATE SK', async () => {
    await deleteRateLimit('RATE#PHONE#+15551234567')
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
