import axios from 'axios'
import axiosRetry from 'axios-retry'

axiosRetry(axios, { retries: 3 })

export const dynamodbTableName = process.env.DYNAMODB_TABLE_NAME as string
export const photoBucketName = process.env.PHOTO_BUCKET_NAME as string
export const photoPresignedUrlExpireSeconds = parseInt(process.env.PHOTO_PRESIGNED_URL_EXPIRE_SECONDS ?? '3600', 10)
export const corsDomain = process.env.CORS_DOMAIN as string
export const smsApiKey = process.env.SMS_API_KEY as string
export const smsApiUrl = process.env.SMS_API_URL as string
export const userPoolId = process.env.COGNITO_USER_POOL_ID as string
