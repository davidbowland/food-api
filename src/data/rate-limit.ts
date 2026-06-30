import { DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import dynamodb from './dynamodb'

const WINDOW_SECONDS = 3600

export const phoneRateLimitKey = (phone: string): string => `RATE#PHONE#${phone}`
export const globalRateLimitKey = 'RATE#GLOBAL'

export const incrementCount = async (pk: string, now = Date.now): Promise<number> => {
  const expiry = Math.floor(now() / 1000) + WINDOW_SECONDS
  const result = await dynamodb.send(
    new UpdateItemCommand({
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':expiry': { N: `${expiry}` },
        ':one': { N: '1' },
      },
      Key: { PK: { S: pk }, SK: { S: 'RATE' } },
      ReturnValues: 'ALL_NEW',
      TableName: dynamodbTableName,
      UpdateExpression: 'ADD #count :one SET #ttl = if_not_exists(#ttl, :expiry)',
    }),
  )
  return parseInt(result.Attributes!['count'].N!, 10)
}

export const deleteRateLimit = async (pk: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: pk }, SK: { S: 'RATE' } },
      TableName: dynamodbTableName,
    }),
  )
}
