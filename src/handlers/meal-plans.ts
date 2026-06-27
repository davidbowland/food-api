import * as service from '../services/meal-plans'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.userId) return status.UNAUTHORIZED

  const method = event.requestContext.http.method
  const planId = event.pathParameters?.id
  const targetUserId = event.pathParameters?.userId

  try {
    if (method === 'GET' && !planId) {
      return { ...status.OK, body: JSON.stringify(await service.listMyMealPlans(auth.userId)) }
    }
    if (method === 'POST' && !planId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.CREATED, body: JSON.stringify(await service.createMealPlan(auth.userId, input as any)) }
    }
    if (method === 'GET' && planId && !targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.getMealPlan(planId, auth.userId)) }
    }
    if (method === 'PUT' && planId && !targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      return { ...status.OK, body: JSON.stringify(await service.updateMealPlan(planId, auth.userId, input as any)) }
    }
    if (method === 'DELETE' && planId && !targetUserId) {
      await service.deleteMealPlan(planId, auth.userId)
      return status.NO_CONTENT
    }
    if (method === 'PUT' && planId && targetUserId) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const { role } = input as any
      return { ...status.OK, body: JSON.stringify(await service.upsertShare(planId, auth.userId, targetUserId, role)) }
    }
    if (method === 'DELETE' && planId && targetUserId) {
      return { ...status.OK, body: JSON.stringify(await service.removeShare(planId, auth.userId, targetUserId)) }
    }
    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
