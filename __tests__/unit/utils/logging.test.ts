import { log, logError, logWarn, xrayCapture, xrayCaptureHttps } from '@utils/logging'

jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((x: unknown) => x),
  captureHTTPsGlobal: jest.fn(),
}))

describe('logging utilities', () => {
  let consoleSpy: { log: jest.SpyInstance; error: jest.SpyInstance; warn: jest.SpyInstance }

  beforeAll(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
      error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    }
  })

  it('log calls console.log', () => {
    log('hello', 'world')
    expect(consoleSpy.log).toHaveBeenCalledWith('hello', 'world')
  })

  it('logError calls console.error', () => {
    logError('oops', new Error('boom'))
    expect(consoleSpy.error).toHaveBeenCalledWith('oops', new Error('boom'))
  })

  it('logWarn calls console.warn', () => {
    logWarn('watch out')
    expect(consoleSpy.warn).toHaveBeenCalledWith('watch out')
  })

  describe('xrayCapture', () => {
    it('returns input unchanged when AWS_SAM_LOCAL is true', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      const client = { name: 'mock-client' }
      expect(xrayCapture(client)).toBe(client)
      delete process.env.AWS_SAM_LOCAL
    })

    it('calls AWSXRay.captureAWSv3Client when not local', () => {
      const AWSXRay = jest.requireMock('aws-xray-sdk-core')
      const client = { name: 'mock-client' }
      xrayCapture(client)
      expect(AWSXRay.captureAWSv3Client).toHaveBeenCalledWith(client)
    })
  })

  describe('xrayCaptureHttps', () => {
    it('returns undefined when AWS_SAM_LOCAL is true', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      expect(xrayCaptureHttps()).toBeUndefined()
      delete process.env.AWS_SAM_LOCAL
    })

    it('calls AWSXRay.captureHTTPsGlobal when not local', () => {
      const AWSXRay = jest.requireMock('aws-xray-sdk-core')
      xrayCaptureHttps()
      expect(AWSXRay.captureHTTPsGlobal).toHaveBeenCalled()
    })
  })
})
