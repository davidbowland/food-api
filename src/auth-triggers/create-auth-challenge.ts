import axios from 'axios'

import { smsApiKey, smsApiUrl } from '../config'

const generateOtp = (): string => String(Math.floor(100000 + Math.random() * 900000))

export const handler = async (event: any): Promise<any> => {
  const otp = generateOtp()
  const phone = event.request.userAttributes.phone_number

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
