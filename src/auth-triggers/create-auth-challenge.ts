import axios from 'axios'
import { randomInt } from 'crypto'

import { smsApiKey, smsApiUrl } from '../config'
import { globalRateLimitKey, incrementCount, phoneRateLimitKey } from '../data/rate-limit'

const GLOBAL_LIMIT = 20
const PHONE_LIMIT = 3

export const handler = async (event: any, rand = () => randomInt(100000, 1000000)): Promise<any> => {
  const phone = event.request.userAttributes.phone_number

  const globalCount = await incrementCount(globalRateLimitKey)
  if (globalCount > GLOBAL_LIMIT) throw new Error('SMS rate limit exceeded')

  const phoneCount = await incrementCount(phoneRateLimitKey(phone))
  if (phoneCount > PHONE_LIMIT) throw new Error('SMS rate limit exceeded')

  const otp = String(rand())
  await axios.post(
    `${smsApiUrl}/messages`,
    { contents: `Your food-api verification code is: ${otp}`, messageType: 'TRANSACTIONAL', to: phone },
    { headers: { 'x-api-key': smsApiKey } },
  )

  event.response.privateChallengeParameters = { otp }
  event.response.publicChallengeParameters = { hint: 'Enter the 6-digit code sent to your phone' }
  event.response.challengeMetadata = 'OTP_CHALLENGE'
  return event
}
