import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors'
import { APIGatewayProxyResultV2 } from '../types'
import { logError } from './logging'
import status from './status'

export const serializeValidationError = (error: ValidationError): string => JSON.stringify({ message: error.message })

export const handleError = (error: unknown): APIGatewayProxyResultV2 => {
  if (error instanceof ValidationError) return { ...status.BAD_REQUEST, body: serializeValidationError(error) }
  if (error instanceof NotFoundError) return status.NOT_FOUND
  if (error instanceof UnauthorizedError) return status.UNAUTHORIZED
  if (error instanceof ForbiddenError) return status.FORBIDDEN
  logError('Unhandled error:', error)
  return status.INTERNAL_SERVER_ERROR
}
