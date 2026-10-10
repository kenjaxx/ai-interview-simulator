import {
  GEMINI_API_KEY,
  MODEL,
  FALLBACK_MODEL,
  geminiUrl,
  GEMINI_PROFILES,
  MIN_RETRY_WINDOW_MS,
  SHORT_RETRY_SEC,
} from "./settings.js"
import { HttpError } from "./errors.js"
import { sleep } from "./utils.js"

function parseRetryDelaySeconds(errorBody) {
  try {
    const details = errorBody?.error?.details || []
    const retryInfo = details.find((d) => d["@type"]?.includes("RetryInfo"))
    const raw = retryInfo?.retryDelay
    if (!raw) return null
    const seconds = parseFloat(String(raw).replace("s", ""))
    return Number.isFinite(seconds) ? Math.ceil(seconds) : null
  } catch {
    return null
  }
}

// One attempt against one model. Throws an HttpError that says whether it's refundable and retryable.
async function callGeminiOnce(model, systemPrompt, userPrompt, schema, temperature, maxOutputTokens, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // A timeout is worth one more try (on the fallback model, if there is time left): a slow model is
  // often a busy model. It is still only refunded up to the daily cap, since we can't tell whose fault it was.
  const timedOut = () =>
    new HttpError(504, "The AI took too long to respond. Please retry.", {}, { refund: "capped", retryable: true })

  try {
    let res
    try {
      res = await fetch(geminiUrl(model), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature,
            maxOutputTokens,
          },
        }),
      })
    } catch (err) {
      if (err.name === "AbortError") throw timedOut()
      console.error(`Gemini network error (${model})`, err)
      throw new HttpError(502, "Couldn't reach the AI service.", {}, { refund: "always", retryable: true })
    }

    if (!res.ok) {
      let errBody = null
      try {
        errBody = await res.json()
      } catch {
        /* not JSON */
      }

      if (res.status === 429) {
        const isDailyQuota = !!errBody?.error?.details?.some((d) =>
          d.violations?.some((v) => v.quotaId?.toLowerCase().includes("perday"))
        )
        const retryAfterSeconds = parseRetryDelaySeconds(errBody)
        throw new HttpError(
          429,
          isDailyQuota
            ? "The daily AI request limit has been reached."
            : "Too many requests right now — the AI is rate-limiting.",
          { isDailyQuota, retryAfterSeconds, limitScope: "provider" },
          { refund: "always", retryable: true, retryDelaySec: retryAfterSeconds }
        )
      }

      // Full details go to server logs only, never to the client.
      console.error(`Gemini API error (${model})`, res.status, JSON.stringify(errBody))
      // 5xx and a missing model are worth one more try (the fallback model may be healthy).
      // Other 4xx (bad key, bad request) would fail the same way again.
      const retryable = res.status >= 500 || res.status === 404
      throw new HttpError(502, "The AI service returned an error.", {}, { refund: "always", retryable })
    }

    let data
    try {
      data = await res.json()
    } catch (err) {
      if (controller.signal.aborted) throw timedOut()
      console.error(`Gemini response body unreadable (${model})`, err.message)
      throw new HttpError(502, "The AI returned an unreadable response.", {}, { refund: "capped" })
    }

    if (data?.promptFeedback?.blockReason) {
      // Caused by the user's content, so no refund.
      console.error("Gemini blocked the prompt:", data.promptFeedback.blockReason)
      throw new HttpError(422, "The AI couldn't evaluate this content.")
    }

    const candidate = data?.candidates?.[0]
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error(`Gemini response was cut off (MAX_TOKENS, ${model})`)
      throw new HttpError(502, "The AI's response was cut off. Please retry.", {}, { refund: "capped" })
    }

    // Skip any "thought" parts and join the rest, so this works whether or not the model returns thoughts.
    const text = (candidate?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
    if (!text) throw new HttpError(502, "The AI returned an empty response.", {}, { refund: "capped" })
    return text
  } finally {
    clearTimeout(timer)
  }
}

// Tries the primary model; on a transient failure (including a timeout) waits briefly and tries ONE
// more time (on the fallback model if it's different), all inside the profile's time budget.
// profile: one of GEMINI_PROFILES (token limit, per-attempt timeout, total budget).
export async function callGemini(
  systemPrompt,
  userPrompt,
  schema,
  temperature = 0.3,
  profile = GEMINI_PROFILES.evaluate
) {
  const { maxOutputTokens, attemptTimeoutMs, totalBudgetMs } = profile
  const deadline = Date.now() + totalBudgetMs
  const models = [MODEL, FALLBACK_MODEL]
  const sameModel = MODEL === FALLBACK_MODEL

  try {
    return await callGeminiOnce(
      models[0],
      systemPrompt,
      userPrompt,
      schema,
      temperature,
      maxOutputTokens,
      attemptTimeoutMs
    )
  } catch (err) {
    if (!(err instanceof HttpError) || !err.retryable) throw err

    // Same model: honor the server's retry hint, but not if it asks for a long wait.
    // Different model: it has its own quota and capacity, so go almost immediately.
    if (sameModel && err.status === 429 && err.retryDelaySec > SHORT_RETRY_SEC) throw err
    const waitMs = sameModel ? Math.max(1, err.retryDelaySec ?? 1) * 1000 : 300

    const remaining = deadline - Date.now() - waitMs
    if (remaining < MIN_RETRY_WINDOW_MS) throw err // not enough time left for a real second attempt

    console.warn(`Gemini ${models[0]} failed (${err.status}); retrying with ${models[1]} in ${waitMs}ms`)
    await sleep(waitMs)
    return await callGeminiOnce(
      models[1],
      systemPrompt,
      userPrompt,
      schema,
      temperature,
      maxOutputTokens,
      Math.min(attemptTimeoutMs, remaining)
    )
  }
}