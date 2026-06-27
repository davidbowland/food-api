export const handler = (event: any): any => {
  const expectedOtp = event.request.privateChallengeParameters.otp
  const providedAnswer = event.request.challengeAnswer
  event.response.answerCorrect = expectedOtp === providedAnswer
  return event
}
