import { deleteRateLimit, phoneRateLimitKey } from '../data/rate-limit'

export const handler = async (event: any): Promise<any> => {
  const sessions = event.request.session ?? []
  if (sessions.length === 0) {
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    event.response.failAuthentication = false
    event.response.issueTokens = false
  } else if (sessions[sessions.length - 1].challengeResult === true) {
    event.response.failAuthentication = false
    event.response.issueTokens = true
    await deleteRateLimit(phoneRateLimitKey(event.request.userAttributes.phone_number))
  } else {
    event.response.failAuthentication = true
    event.response.issueTokens = false
  }
  return event
}
