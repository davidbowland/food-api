import * as service from '../services/ingredients'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method
  const id = event.pathParameters?.id

  try {
    if (method === 'GET' && !id) {
      const ingredients = await service.listIngredients()
      return { ...status.OK, body: JSON.stringify(ingredients) }
    }

    if (method === 'POST' && !id) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const ingredient = await service.createIngredient(input as any)
      return { ...status.CREATED, body: JSON.stringify(ingredient) }
    }

    if (method === 'GET' && id) {
      const ingredient = await service.getIngredient(id)
      return { ...status.OK, body: JSON.stringify(ingredient) }
    }

    if (method === 'PUT' && id) {
      let input: unknown
      try {
        input = JSON.parse(event.body ?? '')
      } catch {
        return status.BAD_REQUEST
      }
      const ingredient = await service.updateIngredient(id, input as any)
      return { ...status.OK, body: JSON.stringify(ingredient) }
    }

    return status.NOT_FOUND
  } catch (error) {
    return handleError(error)
  }
}
