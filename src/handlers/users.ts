import * as service from '../services/users'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const path = event.rawPath
  const recipeId = event.pathParameters?.recipeId

  try {
    if (method === 'GET' && path.endsWith('/users/me')) {
      const user = await service.getOrCreateUser(auth.userId, auth.phone ?? '')
      return { ...status.OK, body: JSON.stringify(user) }
    }

    if (method === 'PUT' && path.endsWith('/users/me')) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const user = await service.updateUser(auth.userId, input as any)
      return { ...status.OK, body: JSON.stringify(user) }
    }

    if (method === 'GET' && path.endsWith('/favorites')) {
      const favorites = await service.listFavorites(auth.userId)
      return { ...status.OK, body: JSON.stringify(favorites) }
    }

    if (method === 'PUT' && recipeId) {
      await service.addFavorite(auth.userId, recipeId)
      return status.NO_CONTENT
    }

    if (method === 'DELETE' && recipeId) {
      await service.removeFavorite(auth.userId, recipeId)
      return status.NO_CONTENT
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
