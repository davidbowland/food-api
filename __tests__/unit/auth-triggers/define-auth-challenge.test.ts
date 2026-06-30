import { handler } from '@auth-triggers/define-auth-challenge'
import { deleteSends, phoneRateLimitKey } from '@data/rate-limit'

jest.mock('@data/rate-limit', () => ({
  deleteSends: jest.fn(),
  phoneRateLimitKey: (phone: string) => `RATE#PHONE#${phone}`,
}))

const phone = '+15551234567'
const userAttributes = { phone_number: phone }

describe('first challenge (no sessions)', () => {
  it('issues CUSTOM_CHALLENGE without tokens', async () => {
    const event = { request: { session: [], userAttributes }, response: {} }
    const result = await handler(event)
    expect(result.response.challengeName).toBe('CUSTOM_CHALLENGE')
    expect(result.response.issueTokens).toBe(false)
    expect(result.response.failAuthentication).toBe(false)
    expect(deleteSends).not.toHaveBeenCalled()
  })
})

describe('correct answer', () => {
  beforeAll(() => {
    jest.mocked(deleteSends).mockResolvedValue(undefined)
  })

  it('issues tokens and resets phone rate limit', async () => {
    const event = {
      request: { session: [{ challengeResult: true }], userAttributes },
      response: {},
    }
    const result = await handler(event)
    expect(result.response.issueTokens).toBe(true)
    expect(result.response.failAuthentication).toBe(false)
    expect(deleteSends).toHaveBeenCalledWith(phoneRateLimitKey(phone))
  })
})

describe('wrong answer', () => {
  it('fails auth without resetting rate limit', async () => {
    const event = {
      request: { session: [{ challengeResult: false }], userAttributes },
      response: {},
    }
    const result = await handler(event)
    expect(result.response.failAuthentication).toBe(true)
    expect(result.response.issueTokens).toBe(false)
    expect(deleteSends).not.toHaveBeenCalled()
  })
})
