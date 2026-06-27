import * as config from '@config'

describe('config', () => {
  it('exports dynamodbTableName from env', () => {
    expect(config.dynamodbTableName).toBe('food-api-test')
  })

  it('exports photoBucketName from env', () => {
    expect(config.photoBucketName).toBe('food-api-photos-test')
  })

  it('exports photoPresignedUrlExpireSeconds as a number', () => {
    expect(config.photoPresignedUrlExpireSeconds).toBe(3600)
  })

  it('exports corsDomain from env', () => {
    expect(config.corsDomain).toBe('https://food.bowland.link')
  })

  it('exports smsApiKey from env', () => {
    expect(config.smsApiKey).toBe('3edfgr4ertyjkijhg8')
  })

  it('exports smsApiUrl from env', () => {
    expect(config.smsApiUrl).toBe('https://sms-queue-api.bowland.link/v1')
  })
})
