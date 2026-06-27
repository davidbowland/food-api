import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { ShoppingListRecord } from '../types'
import dynamodb from './dynamodb'

export const getShoppingList = async (listId: string): Promise<ShoppingListRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({ Key: { PK: { S: `LIST#${listId}` }, SK: { S: 'METADATA' } }, TableName: dynamodbTableName }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Shopping list not found')
  return JSON.parse(response.Item.Data.S)
}

export const putShoppingList = async (list: ShoppingListRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${list.createdAt}` },
        Data: { S: JSON.stringify(list) },
        ownerUserId: { S: list.ownerUserId },
        PK: { S: `LIST#${list.listId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteShoppingList = async (listId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `LIST#${listId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listShoppingListsByOwner = async (ownerUserId: string): Promise<ShoppingListRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':owner': { S: ownerUserId } },
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? [])
    .map((item: { Data?: { S?: string } }) => JSON.parse(item.Data?.S ?? '{}'))
    .filter((x: { listId?: string }) => x.listId)
}

export const putSharedListIndex = async (userId: string, listId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: { listId: { S: listId }, PK: { S: `USER#${userId}` }, SK: { S: `SHARED_LIST#${listId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteSharedListIndex = async (userId: string, listId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `SHARED_LIST#${listId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listSharedListIds = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':pk': { S: `USER#${userId}` }, ':skPrefix': { S: 'SHARED_LIST#' } },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { listId?: { S?: string } }) => item.listId?.S ?? '')
}
