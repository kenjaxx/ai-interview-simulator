import { consumeRequest, RATE_LIMITS } from "./rateLimit.js"
import { HttpError } from "./errors.js"

// Reserves one evaluation for this user, or throws the right HTTP error.
export async function reserveRequest(uid) {
  let result
  try {
    result = await consumeRequest(uid)
  } catch (err) {
    // Fail closed: if we can't count usage, we don't spend money.
    console.error("Rate limiter unavailable:", err.message)
    throw new HttpError(503, "Couldn't check your usage limit right now. Please try again in a moment.")
  }

  if (result.allowed) return result

  const { reason, retryAfterSeconds } = result
  if (reason === "user_daily") {
    throw new HttpError(
      429,
      `You've used all ${RATE_LIMITS.DAILY_LIMIT} of today's AI evaluations. They reset at midnight UTC.`,
      { isDailyQuota: true, retryAfterSeconds, limitScope: "user" }
    )
  }
  if (reason === "user_burst") {
    throw new HttpError(429, "You're sending requests too quickly. Please wait a moment.", {
      isDailyQuota: false,
      retryAfterSeconds,
      limitScope: "user",
    })
  }
  throw new HttpError(429, "The app's daily AI budget has been reached. Please try again tomorrow.", {
    isDailyQuota: true,
    retryAfterSeconds,
    limitScope: "global",
  })
}
