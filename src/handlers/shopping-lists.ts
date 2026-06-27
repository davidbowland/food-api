import * as service from '../services/shopping-lists'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const listId = event.pathParameters?.id
  const itemId = event.pathParameters?.itemId
  const targetUserId = event.pathParameters?.userId

  try {
    if (method === 'GET' && !listId) {
      return { ...status.OK, body: JSON.stringify(await service.listMyShoppingLists(auth.userId)) }
    }
    if (method === 'POST' && !listId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createShoppingList(auth.userId, input as any)) }
    }
    if (method === 'GET' && listId && !itemId && !targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.getShoppingList(listId, auth.userId)) }
    }
    if (method === 'PUT' && listId && !itemId && !targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateShoppingList(listId, auth.userId, input as any)) }
    }
    if (method === 'DELETE' && listId && !itemId && !targetUserId) {
      await service.deleteShoppingList(listId, auth.userId)
      return status.NO_CONTENT
    }
    if (method === 'PUT' && listId && itemId) {
      return { ...status.OK, body: JSON.stringify(await service.checkItem(listId, itemId, auth.userId)) }
    }
    if (method === 'DELETE' && listId && itemId) {
      return { ...status.OK, body: JSON.stringify(await service.uncheckItem(listId, itemId, auth.userId)) }
    }
    if (method === 'PUT' && listId && targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const { role } = input as any
      return { ...status.OK, body: JSON.stringify(await service.upsertShare(listId, auth.userId, targetUserId, role)) }
    }
    if (method === 'DELETE' && listId && targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.removeShare(listId, auth.userId, targetUserId)) }
    }
    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
