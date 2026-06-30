import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import dynamodb from './dynamodb'

const WINDOW_MS = 3_600_000
const WINDOW_SECONDS = 3600

export const phoneRateLimitKey = (phone: string): string => `RATE#PHONE#${phone}`
export const globalRateLimitKey = 'RATE#GLOBAL'

export const getSends = async (pk: string, nowMs: number): Promise<number[]> => {
  const result = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: pk }, SK: { S: 'RATE' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!result.Item?.sends?.S) return []
  return (JSON.parse(result.Item.sends.S) as number[]).filter((t) => nowMs - t < WINDOW_MS)
}

export const putSends = async (pk: string, sends: number[], nowMs: number): Promise<void> => {
  const ttl = Math.floor(nowMs / 1000) + WINDOW_SECONDS + 300
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        PK: { S: pk },
        SK: { S: 'RATE' },
        sends: { S: JSON.stringify(sends) },
        ttl: { N: `${ttl}` },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteSends = async (pk: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: pk }, SK: { S: 'RATE' } },
      TableName: dynamodbTableName,
    }),
  )
}
