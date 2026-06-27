import { DynamoDB } from '@aws-sdk/client-dynamodb'

import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDB())

export default dynamodb
