import * as service from '../services/photos'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { handleError } from '../utils/errors'
import status from '../utils/status'

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated) return status.UNAUTHORIZED

  try {
    const result = await service.generatePresignedUploadUrl()
    return { ...status.OK, body: JSON.stringify(result) }
  } catch (error) {
    return handleError(error)
  }
}
