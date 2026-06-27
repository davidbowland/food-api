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
