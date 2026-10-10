export class GeminiApiError extends Error {
  constructor(
    message,
    { status, isQuotaError = false, isDailyQuota = false, retryAfterSeconds = null, limitScope = null } = {}
  ) {
    super(message)
    this.name = "GeminiApiError"
    this.status = status
    this.isQuotaError = isQuotaError
    this.isDailyQuota = isDailyQuota
    this.retryAfterSeconds = retryAfterSeconds
    // Who ran out: "user" (your personal allowance), "global" (the whole app's budget),
    // or "provider" (Gemini itself is rate-limiting).
    this.limitScope = limitScope
  }
}
