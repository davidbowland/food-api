import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { IngredientRecord } from '../types'
import dynamodb from './dynamodb'

export const getIngredient = async (ingredientId: string): Promise<IngredientRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `INGREDIENT#${ingredientId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Ingredient not found')
  return JSON.parse(response.Item.Data.S)
}

export const putIngredient = async (ingredient: IngredientRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${ingredient.createdAt}` },
        Data: { S: JSON.stringify(ingredient) },
        entityType: { S: 'ingredient' },
        PK: { S: `INGREDIENT#${ingredient.ingredientId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteIngredient = async (ingredientId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `INGREDIENT#${ingredientId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listIngredients = async (): Promise<IngredientRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':et': { S: 'ingredient' } },
      IndexName: 'type-index',
      KeyConditionExpression: 'entityType = :et',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { Data?: { S?: string } }) => JSON.parse(item.Data?.S ?? '{}'))
}
