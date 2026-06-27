// DynamoDB

process.env.DYNAMODB_TABLE_NAME = 'food-api-test'

// Photos

process.env.PHOTO_BUCKET_NAME = 'food-api-photos-test'
process.env.PHOTO_PRESIGNED_URL_EXPIRE_SECONDS = '3600'

// CORS / SMS

process.env.CORS_DOMAIN = 'https://food.bowland.link'
process.env.SMS_API_KEY = '3edfgr4ertyjkijhg8'
process.env.SMS_API_URL = 'https://sms-queue-api.bowland.link/v1'
