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
