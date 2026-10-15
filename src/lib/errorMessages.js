import { resetPhrase } from "./time"

// Turns an error from the evaluation call into a message that is safe and useful to show the user.
export function messageForError(err) {
  if (err?.status === 401) {
    return "Your session expired. Please sign out and sign in again."
  }

  if (err?.isQuotaError) {
    // Your personal daily allowance is used up
    if (err.limitScope === "user" && err.isDailyQuota) {
      return `You've used all of your AI evaluations for today. They reset ${resetPhrase()}. You can score this session with Practice Mode instead.`
    }
    // The whole app's daily budget is used up
    if (err.limitScope === "global") {
      return "The app's daily AI budget has been used up. Score this session with Practice Mode, or come back tomorrow."
    }
    // Gemini's own daily quota
    if (err.isDailyQuota) {
      return "The AI service has hit its daily request limit. It resets at midnight Pacific Time. You can score this session with Practice Mode instead."
    }
    return err.retryAfterSeconds
      ? `Too many requests right now. Try again in about ${err.retryAfterSeconds}s.`
      : "You've hit the AI request limit for now. Please wait a bit and try again."
  }

  // The server (or the client wrapper) sent a specific, user-safe message: show it.
  // Status 0 means the request never reached the server, so the generic network message below fits better.
  if (err?.status > 0 && err?.message) {
    return err.message
  }

  return "Couldn't reach the interviewer AI. Check your connection and try again."
}
