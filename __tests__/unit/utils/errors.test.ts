import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '@errors'

import { handleError, serializeValidationError } from '@utils/errors'

describe('serializeValidationError', () => {
  it('serializes the error message to JSON', () => {
    const error = new ValidationError('field is required')
    expect(serializeValidationError(error)).toBe('{"message":"field is required"}')
  })
})

describe('handleError', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns BAD_REQUEST with message body for ValidationError', () => {
    const error = new ValidationError('bad input')
    const result = handleError(error)
    expect(result).toMatchObject({ statusCode: 400, body: '{"message":"bad input"}' })
  })

  it('returns NOT_FOUND for NotFoundError', () => {
    const result = handleError(new NotFoundError('not found'))
    expect(result).toMatchObject({ statusCode: 404 })
  })

  it('returns UNAUTHORIZED for UnauthorizedError', () => {
    const result = handleError(new UnauthorizedError('unauthorized'))
    expect(result).toMatchObject({ statusCode: 401 })
  })

  it('returns FORBIDDEN for ForbiddenError', () => {
    const result = handleError(new ForbiddenError('forbidden'))
    expect(result).toMatchObject({ statusCode: 403 })
  })

  it('logs and returns INTERNAL_SERVER_ERROR for unknown errors', () => {
    const error = new Error('unexpected')
    const result = handleError(error)
    expect(result).toMatchObject({ statusCode: 500 })
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error:', error)
  })
})
