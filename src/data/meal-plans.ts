import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

import { dynamodbTableName } from '../config'
import { NotFoundError } from '../errors'
import { MealPlanRecord } from '../types'
import dynamodb from './dynamodb'

export const getMealPlan = async (planId: string): Promise<MealPlanRecord> => {
  const response = await dynamodb.send(
    new GetItemCommand({ Key: { PK: { S: `PLAN#${planId}` }, SK: { S: 'METADATA' } }, TableName: dynamodbTableName }),
  )
  if (!response.Item?.Data?.S) throw new NotFoundError('Meal plan not found')
  return JSON.parse(response.Item.Data.S)
}

export const putMealPlan = async (plan: MealPlanRecord): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: {
        createdAt: { N: `${plan.createdAt}` },
        Data: { S: JSON.stringify(plan) },
        ownerUserId: { S: plan.ownerUserId },
        PK: { S: `PLAN#${plan.planId}` },
        SK: { S: 'METADATA' },
      },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteMealPlan = async (planId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `PLAN#${planId}` }, SK: { S: 'METADATA' } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listMealPlansByOwner = async (ownerUserId: string): Promise<MealPlanRecord[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':owner': { S: ownerUserId }, ':et': { S: 'plan' } },
      FilterExpression: 'attribute_not_exists(#et) OR #et = :et',
      IndexName: 'owner-index',
      KeyConditionExpression: 'ownerUserId = :owner',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? [])
    .map((item: { Data?: { S?: string } }) => JSON.parse(item.Data?.S ?? '{}'))
    .filter((x: { planId?: string }) => x.planId)
}

export const putSharedPlanIndex = async (userId: string, planId: string): Promise<void> => {
  await dynamodb.send(
    new PutItemCommand({
      Item: { PK: { S: `USER#${userId}` }, planId: { S: planId }, SK: { S: `SHARED_PLAN#${planId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const deleteSharedPlanIndex = async (userId: string, planId: string): Promise<void> => {
  await dynamodb.send(
    new DeleteItemCommand({
      Key: { PK: { S: `USER#${userId}` }, SK: { S: `SHARED_PLAN#${planId}` } },
      TableName: dynamodbTableName,
    }),
  )
}

export const listSharedPlanIds = async (userId: string): Promise<string[]> => {
  const response = await dynamodb.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':pk': { S: `USER#${userId}` }, ':skPrefix': { S: 'SHARED_PLAN#' } },
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      TableName: dynamodbTableName,
    }),
  )
  return (response.Items ?? []).map((item: { planId?: { S?: string } }) => item.planId?.S ?? '')
}
