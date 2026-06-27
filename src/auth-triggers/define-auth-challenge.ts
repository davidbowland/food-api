export const handler = (event: any): any => {
  const sessions = event.request.session ?? []
  if (sessions.length === 0) {
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    event.response.failAuthentication = false
    event.response.issueTokens = false
  } else if (sessions.length > 0 && sessions[sessions.length - 1].challengeResult === true) {
    event.response.failAuthentication = false
    event.response.issueTokens = true
  } else {
    event.response.failAuthentication = true
    event.response.issueTokens = false
  }
  return event
}
