import axios from 'axios'
import { randomInt } from 'crypto'

import { smsApiKey, smsApiUrl } from '../config'
import { getSends, globalRateLimitKey, phoneRateLimitKey, putSends } from '../data/rate-limit'
import { logWarn } from '../utils/logging'

const GLOBAL_LIMIT = 20
const PHONE_LIMIT = 3

export const handler = async (event: any, now = Date.now, rand = () => randomInt(100000, 1000000)): Promise<any> => {
  const phone = event.request.userAttributes.phone_number
  const nowMs = now()

  const globalSends = await getSends(globalRateLimitKey, nowMs)
  if (globalSends.length >= GLOBAL_LIMIT) {
    logWarn(`Global SMS rate limit reached: ${globalSends.length}/${GLOBAL_LIMIT} sends in the last hour`)
    throw new Error('SMS rate limit exceeded')
  }

  const phoneSends = await getSends(phoneRateLimitKey(phone), nowMs)
  if (phoneSends.length >= PHONE_LIMIT) {
    logWarn(`Per-phone SMS rate limit reached for ${phone}: ${phoneSends.length}/${PHONE_LIMIT} sends in the last hour`)
    throw new Error('SMS rate limit exceeded')
  }

  const otp = String(rand())
  await axios.post(
    `${smsApiUrl}/messages`,
    { contents: `Your food-api verification code is: ${otp}`, messageType: 'TRANSACTIONAL', to: phone },
    { headers: { 'x-api-key': smsApiKey } },
  )

  await Promise.all([
    putSends(globalRateLimitKey, [...globalSends, nowMs], nowMs),
    putSends(phoneRateLimitKey(phone), [...phoneSends, nowMs], nowMs),
  ])

  event.response.privateChallengeParameters = { otp }
  event.response.publicChallengeParameters = { hint: 'Enter the 6-digit code sent to your phone' }
  event.response.challengeMetadata = 'OTP_CHALLENGE'
  return event
}
