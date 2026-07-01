#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Only install production modules
export NODE_ENV=production

# Build the project
SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE}

# Start the API locally
export DYNAMODB_TABLE_NAME=food-api-test
export PHOTO_BUCKET_NAME=food-api-uploads-test
export PHOTO_CDN_DOMAIN='food-photos.bowland.link'
export PHOTO_PRESIGNED_URL_EXPIRE_SECONDS=3600
export SMS_API_KEY=$(aws apigateway get-api-key --api-key l3q9ffyih6 --include-value --region us-east-1 | jq -r '.value')
export SMS_API_URL='https://sms-queue-api.bowland.link/v1'
# Fill in the test User Pool ID, e.g. via: aws cognito-idp list-user-pools --max-results 20
export COGNITO_USER_POOL_ID=
sam local start-api --region=us-east-2 --force-image-build --parameter-overrides "Environment=test SmsApiKey=$SMS_API_KEY" --log-file local.log
