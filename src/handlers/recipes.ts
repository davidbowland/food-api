import * as service from '../services/recipes'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  const method = event.requestContext.http.method
  const path = event.rawPath
  const id = event.pathParameters?.id

  try {
    // GET /users/me/recipes — must be authenticated
    if (method === 'GET' && path.endsWith('/users/me/recipes')) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      return { ...status.OK, body: JSON.stringify(await service.listMyRecipes(auth.userId)) }
    }

    // GET /recipes — public
    if (method === 'GET' && !id) {
      return { ...status.OK, body: JSON.stringify(await service.listPublishedRecipes()) }
    }

    // POST /recipes — must be authenticated
    if (method === 'POST' && !id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createRecipe(auth.userId, input as any)) }
    }

    // GET /recipes/{id} — public but draft requires ownership
    if (method === 'GET' && id) {
      const recipe = await service.getRecipe(id, auth.userId ?? undefined)
      return { ...status.OK, body: JSON.stringify(recipe) }
    }

    // PUT /recipes/{id} — must be authenticated
    if (method === 'PUT' && id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateRecipe(id, auth.userId, input as any)) }
    }

    // DELETE /recipes/{id} — must be authenticated
    if (method === 'DELETE' && id) {
      if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED
      await service.deleteRecipe(id, auth.userId)
      return status.NO_CONTENT
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
