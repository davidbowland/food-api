import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { UserRecord } from '../types'
import dynamodb from './dynamodb'

export const getUser = async (userId: string): Promise<UserRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: 'PROFILE' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('User not found')
  return JSON.parse(response.Item.Data.S)
}

export const putUser = async (user: UserRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${user.createdAt}` },
        Data: { S: JSON.stringify(user) },
        PK: { S: `USER#${user.userId}` },
        SK: { S: 'PROFILE' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const addFavorite = async (userId: string, recipeId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        addedAt: { N: `${Date.now()}` },
        PK: { S: `USER#${userId}` },
        recipeId: { S: recipeId },
        SK: { S: `FAVORITE#${recipeId}` },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const removeFavorite = async (userId: string, recipeId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `FAVORITE#${recipeId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listFavorites = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: {
        ':pk': { S: `USER#${userId}` },
        ':skPrefix': { S: 'FAVORITE#' },
      },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { recipeId?: { S?: string } }) => item.recipeId?.S ?? '')
}
