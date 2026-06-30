import { handler } from '@auth-triggers/create-auth-challenge'
import { getSends, globalRateLimitKey, phoneRateLimitKey, putSends } from '@data/rate-limit'
import axios from 'axios'

import { logWarn } from '@utils/logging'

jest.mock('axios')
jest.mock('@data/rate-limit', () => ({
  getSends: jest.fn(),
  globalRateLimitKey: 'RATE#GLOBAL',
  phoneRateLimitKey: (phone: string) => `RATE#PHONE#${phone}`,
  putSends: jest.fn(),
}))
jest.mock('@utils/logging', () => ({ logWarn: jest.fn() }))

const phone = '+15551234567'
const nowMs = 1_720_000_000_000
const nowFn = () => nowMs
const fixedRand = () => 123456

const baseEvent = () => ({
  request: { userAttributes: { phone_number: phone } },
  response: {},
})

describe('handler — under limits', () => {
  beforeAll(() => {
    jest.mocked(getSends).mockResolvedValue([])
    jest.mocked(putSends).mockResolvedValue(undefined)
    jest.mocked(axios.post).mockResolvedValue({} as any)
  })

  it('sends OTP SMS with fixed code', async () => {
    await handler(baseEvent(), nowFn, fixedRand)
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ contents: expect.stringContaining('123456'), to: phone }),
      expect.any(Object),
    )
  })

  it('returns event with otp and metadata', async () => {
    const result = await handler(baseEvent(), nowFn, fixedRand)
    expect(result.response.privateChallengeParameters.otp).toBe('123456')
    expect(result.response.publicChallengeParameters.hint).toBeDefined()
    expect(result.response.challengeMetadata).toBe('OTP_CHALLENGE')
  })

  it('records both sends after SMS is sent', async () => {
    await handler(baseEvent(), nowFn, fixedRand)
    expect(putSends).toHaveBeenCalledWith(globalRateLimitKey, [nowMs], nowMs)
    expect(putSends).toHaveBeenCalledWith(phoneRateLimitKey(phone), [nowMs], nowMs)
  })

  it('checks global limit before phone limit', async () => {
    await handler(baseEvent(), nowFn, fixedRand)
    const calls = jest.mocked(getSends).mock.calls
    expect(calls[0][0]).toBe(globalRateLimitKey)
    expect(calls[1][0]).toBe(phoneRateLimitKey(phone))
  })
})

describe('handler — existing sends within window', () => {
  const priorSend = nowMs - 1000

  beforeAll(() => {
    jest.mocked(getSends).mockResolvedValue([priorSend])
    jest.mocked(putSends).mockResolvedValue(undefined)
    jest.mocked(axios.post).mockResolvedValue({} as any)
  })

  it('appends nowMs to existing active sends when recording', async () => {
    await handler(baseEvent(), nowFn, fixedRand)
    expect(putSends).toHaveBeenCalledWith(globalRateLimitKey, [priorSend, nowMs], nowMs)
    expect(putSends).toHaveBeenCalledWith(phoneRateLimitKey(phone), [priorSend, nowMs], nowMs)
  })
})

describe('handler — global limit reached', () => {
  beforeAll(() => {
    jest.mocked(getSends).mockResolvedValue(Array(20).fill(nowMs - 1000))
  })

  it('throws without sending SMS or recording', async () => {
    await expect(handler(baseEvent(), nowFn, fixedRand)).rejects.toThrow('SMS rate limit exceeded')
    expect(axios.post).not.toHaveBeenCalled()
    expect(putSends).not.toHaveBeenCalled()
  })

  it('logs a WARN with count and limit', async () => {
    await expect(handler(baseEvent(), nowFn, fixedRand)).rejects.toThrow()
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('20/20'))
  })
})

describe('handler — phone limit reached', () => {
  beforeAll(() => {
    jest
      .mocked(getSends)
      .mockResolvedValueOnce([])
      .mockResolvedValue(Array(3).fill(nowMs - 1000))
  })

  it('throws without sending SMS or recording', async () => {
    await expect(handler(baseEvent(), nowFn, fixedRand)).rejects.toThrow('SMS rate limit exceeded')
    expect(axios.post).not.toHaveBeenCalled()
    expect(putSends).not.toHaveBeenCalled()
  })

  it('logs a WARN with phone number, count and limit', async () => {
    jest
      .mocked(getSends)
      .mockResolvedValueOnce([])
      .mockResolvedValue(Array(3).fill(nowMs - 1000))
    await expect(handler(baseEvent(), nowFn, fixedRand)).rejects.toThrow()
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining(phone))
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('3/3'))
  })
})
