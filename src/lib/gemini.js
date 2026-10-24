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

      // Full details always go to the server logs, with the model and status on one line.
      console.error(
        `Gemini API error (${model}) status=${res.status} message=${errBody?.error?.message ?? "(none)"}`
      )

      // 5xx and a missing model are worth another try. Other 4xx (bad key, bad request) would fail
      // the same way again, so they are not retried.
      const retryable = res.status >= 500 || res.status === 404

      // The status code is safe to show and makes failures diagnosable from the browser.
      let message
      if (res.status === 503) message = "The AI is very busy right now. Please try again in a minute. (503)"
      else if (res.status === 400) message = "The AI rejected the request. (400)"
      else if (res.status === 401 || res.status === 403) message = "The server's AI key was rejected. (" + res.status + ")"
      else if (res.status === 404) message = "The configured AI model wasn't found. (404)"
      else message = `The AI service returned an error. (${res.status})`

      throw new HttpError(502, message, {}, { refund: "always", retryable })
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
      console.error("Gemini blocked the prompt:", data.promptFeedback.blockReason)
      throw new HttpError(422, "The AI couldn't evaluate this content.")
    }

    const candidate = data?.candidates?.[0]
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error(`Gemini response was cut off (MAX_TOKENS, ${model})`)
      throw new HttpError(502, "The AI's response was cut off. Please retry.", {}, { refund: "capped", retryable: true })
    }

    const text = (candidate?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
    if (!text) throw new HttpError(502, "The AI returned an empty response.", {}, { refund: "capped", retryable: true })
    return text
  } finally {
    clearTimeout(timer)
  }
}

// Tries up to three attempts inside the profile's time budget:
//   1. the primary model
//   2. the fallback model (a different model has its own capacity), almost immediately
//   3. the primary again after a short pause, in case the spike has passed
// If both models are the same, it makes two attempts on that model with a pause between.
export async function callGemini(
  systemPrompt,
  userPrompt,
  schema,
  temperature = 0.3,
  profile = GEMINI_PROFILES.evaluate
) {
  const { maxOutputTokens, attemptTimeoutMs, totalBudgetMs } = profile
  const deadline = Date.now() + totalBudgetMs
  const sameModel = MODEL === FALLBACK_MODEL
  const sequence = sameModel ? [MODEL, MODEL] : [MODEL, FALLBACK_MODEL, MODEL]

  let lastError = null

  for (let i = 0; i < sequence.length; i++) {
    const model = sequence[i]
    const remaining = deadline - Date.now()
    if (i > 0 && remaining < MIN_RETRY_WINDOW_MS) break

    try {
      return await callGeminiOnce(
        model,
        systemPrompt,
        userPrompt,
        schema,
        temperature,
        maxOutputTokens,
        Math.min(attemptTimeoutMs, remaining)
      )
    } catch (err) {
      if (!(err instanceof HttpError) || !err.retryable) throw err
      lastError = err

      const next = sequence[i + 1]
      if (!next) break

      // A 429 that asks for a long wait on the same model isn't worth waiting for.
      if (next === model && err.status === 429 && err.retryDelaySec > SHORT_RETRY_SEC) throw err

      const waitMs = next !== model ? 300 : Math.max(2, err.retryDelaySec ?? 2) * 1000
      if (deadline - Date.now() - waitMs < MIN_RETRY_WINDOW_MS) break

      console.warn(`Gemini ${model} failed (${err.status}); trying ${next} in ${waitMs}ms`)
      await sleep(waitMs)
    }
  }

  throw lastError
}