import { auth, getAppCheckToken } from "./firebase"
import { GeminiApiError } from "./apiError"

// Slightly longer than the server's own time budget (about 52s, including a retry) so the
// server's error wins the race.
const REQUEST_TIMEOUT_MS = 60_000

// Calls the Vercel serverless function. isValid(body) checks the response has the shape the caller expects.
export async function callBackend(payload, isValid) {
  const user = auth.currentUser
  if (!user) throw new GeminiApiError("You must be signed in.", { status: 401 })

  const [idToken, appCheckToken] = await Promise.all([user.getIdToken(), getAppCheckToken()])

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  }
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch("/api/evaluate", {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (err.name === "AbortError") {
      throw new GeminiApiError("The AI took too long to respond. Please retry.", { status: 504 })
    }
    throw new GeminiApiError("Couldn't reach the interviewer AI.", { status: 0 })
  } finally {
    clearTimeout(timer)
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    /* not JSON, ignore */
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new GeminiApiError(body?.error || "Rate limited.", {
        status: 429,
        isQuotaError: true,
        isDailyQuota: !!body?.isDailyQuota,
        retryAfterSeconds: body?.retryAfterSeconds ?? null,
        limitScope: body?.limitScope ?? null,
      })
    }

    // No JSON body means the request never reached our handler code: the route doesn't exist
    // (plain `vite` doesn't serve /api) or the function crashed while loading.
    if (!body) {
      console.error(`/api/evaluate returned HTTP ${res.status} with no JSON body. Check the function logs.`)
      if (import.meta.env.DEV && res.status === 404) {
        throw new GeminiApiError(
          "The /api/evaluate endpoint wasn't found. Run the app with `vercel dev` (plain `vite` doesn't serve /api), or set VITE_MOCK_AI=true in .env.",
          { status: 404 }
        )
      }
      throw new GeminiApiError("The server had a problem. Please try again in a moment.", {
        status: res.status,
      })
    }

    throw new GeminiApiError(body?.error || "Couldn't reach the interviewer AI.", { status: res.status })
  }

  if (!body || !isValid(body)) {
    throw new GeminiApiError("The server returned an unexpected response.", { status: res.status })
  }

  return body
}
