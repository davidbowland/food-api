import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { RecipeRecord } from '../types'
import dynamodb from './dynamodb'

export const getRecipe = async (recipeId: string): Promise<RecipeRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({
      Key: { PK: { S: `RECIPE#${recipeId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Recipe not found')
  return JSON.parse(response.Item.Data.S)
}

export const putRecipe = async (recipe: RecipeRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${recipe.createdAt}` },
        Data: { S: JSON.stringify(recipe) },
        entityType: { S: 'recipe' },
        ownerUserId: { S: recipe.authorUserId },
        PK: { S: `RECIPE#${recipe.recipeId}` },
        recipeStatus: { S: recipe.status },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteRecipe = async (recipeId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `RECIPE#${recipeId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listPublishedRecipes = async (): Promise<RecipeRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':status': { S: 'published' } },
      IndexName: 'status-index',
      KeyConditionExpression: 'recipeStatus = :status',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { Data?: { S?: string } }) => JSON.parse(item.Data?.S ?? '{}'))
}

export const listRecipesByAuthor = async (authorUserId: string): Promise<RecipeRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: {
        ':et': { S: 'recipe' },
        ':owner': { S: authorUserId },
      },
      FilterExpression: '#et = :et',
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { Data?: { S?: string } }) => JSON.parse(item.Data?.S ?? '{}'))
}
