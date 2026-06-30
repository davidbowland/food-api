import { handler } from '@auth-triggers/create-auth-challenge'
import { globalRateLimitKey, incrementCount, phoneRateLimitKey } from '@data/rate-limit'
import axios from 'axios'

jest.mock('axios')
jest.mock('@data/rate-limit', () => ({
  globalRateLimitKey: 'RATE#GLOBAL',
  incrementCount: jest.fn(),
  phoneRateLimitKey: (phone: string) => `RATE#PHONE#${phone}`,
}))

const phone = '+15551234567'
const baseEvent = {
  request: { userAttributes: { phone_number: phone } },
  response: {},
}
const fixedRand = () => 123456

describe('handler — under limits', () => {
  beforeAll(() => {
    jest.mocked(incrementCount).mockResolvedValue(1)
    jest.mocked(axios.post).mockResolvedValue({} as any)
  })

  it('sends OTP SMS and returns event', async () => {
    const event = structuredClone(baseEvent)
    const result = await handler(event, fixedRand)
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ contents: expect.stringContaining('123456'), to: phone }),
      expect.any(Object),
    )
    expect(result.response.privateChallengeParameters.otp).toBe('123456')
    expect(result.response.publicChallengeParameters.hint).toBeDefined()
    expect(result.response.challengeMetadata).toBe('OTP_CHALLENGE')
  })

  it('checks global limit before phone limit', async () => {
    const event = structuredClone(baseEvent)
    await handler(event, fixedRand)
    const calls = jest.mocked(incrementCount).mock.calls
    expect(calls[0][0]).toBe(globalRateLimitKey)
    expect(calls[1][0]).toBe(phoneRateLimitKey(phone))
  })
})

describe('handler — global limit exceeded', () => {
  beforeAll(() => {
    jest.mocked(incrementCount).mockResolvedValue(21)
  })

  it('throws without sending SMS', async () => {
    const event = structuredClone(baseEvent)
    await expect(handler(event, fixedRand)).rejects.toThrow('SMS rate limit exceeded')
    expect(axios.post).not.toHaveBeenCalled()
  })
})

describe('handler — phone limit exceeded', () => {
  beforeAll(() => {
    jest.mocked(incrementCount).mockResolvedValueOnce(1).mockResolvedValue(4)
  })

  it('throws without sending SMS', async () => {
    const event = structuredClone(baseEvent)
    await expect(handler(event, fixedRand)).rejects.toThrow('SMS rate limit exceeded')
    expect(axios.post).not.toHaveBeenCalled()
  })
})
