import { auth } from "./firebase"

// Set VITE_MOCK_AI=true in your .env to bypass the backend entirely during
// UI/dev work: zero quota spent, instant fake responses.
const MOCK_MODE = import.meta.env.VITE_MOCK_AI === "true"

export class GeminiApiError extends Error {
  constructor(message, { status, isQuotaError = false, isDailyQuota = false, retryAfterSeconds = null } = {}) {
    super(message)
    this.name = "GeminiApiError"
    this.status = status
    this.isQuotaError = isQuotaError
    this.isDailyQuota = isDailyQuota
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Slightly longer than the server's own Gemini timeout so the server's error wins the race.
const REQUEST_TIMEOUT_MS = 60_000

// ---------- Backend call (Vercel serverless function) ----------

async function callBackend(payload) {
  const user = auth.currentUser
  if (!user) throw new GeminiApiError("You must be signed in.", { status: 401 })

  const idToken = await user.getIdToken()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch("/api/evaluate", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
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
      })
    }
    throw new GeminiApiError(body?.error || "Couldn't reach the interviewer AI.", { status: res.status })
  }

  if (!body || !Array.isArray(body.evaluations)) {
    throw new GeminiApiError("The server returned an unexpected response.", { status: res.status })
  }

  return body
}

// ---------- Mock helpers (used only for Practice Mode / MOCK_MODE) ----------

function mockDelay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Heuristic, metrics-based evaluation for a single Q&A, with no real AI judgment.
function mockEvaluation(answer = "", metrics = {}) {
  const { fillerCount = 0, wpm = 0, responseDelaySec = 0 } = metrics
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0

  let confidenceScore = 90
  confidenceScore -= fillerCount * 4
  confidenceScore -= Math.max(0, responseDelaySec - 3) * 2
  if (wpm > 0 && (wpm < 90 || wpm > 190)) confidenceScore -= 10
  confidenceScore = clamp(Math.round(confidenceScore), 30, 98)

  let clarityScore = 88
  if (wpm > 0) {
    const distanceFromIdeal = Math.abs(wpm - 140)
    clarityScore -= Math.round(distanceFromIdeal / 5)
  }
  clarityScore -= Math.floor(fillerCount / 2)
  clarityScore = clamp(clarityScore, 30, 97)

  let contentScore = 60
  if (wordCount >= 25) contentScore = 78
  if (wordCount >= 60) contentScore = 88
  if (wordCount < 10) contentScore = 45
  contentScore = clamp(contentScore, 20, 95)

  const scores = { content: contentScore, clarity: clarityScore, confidence: confidenceScore }
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]

  const feedbackByArea = {
    content: `(Mock feedback) You gave a ${wordCount}-word answer — a bit more detail or a concrete example would strengthen it.`,
    clarity: `(Mock feedback) Your pace was around ${wpm || "an unmeasured"} wpm — aim for a steady, conversational rhythm to sound clearer.`,
    confidence:
      fillerCount > 0
        ? `(Mock feedback) You used ${fillerCount} filler word${fillerCount === 1 ? "" : "s"} (um/uh/like) — cutting those down will sound more confident.`
        : `(Mock feedback) Watch your response delay (${responseDelaySec}s before you started) — jumping in sooner reads as more confident.`,
  }

  const tipByArea = {
    content: "(Mock tip) Structure your answer with a brief example: situation, action, result.",
    clarity: "(Mock tip) Practice saying your answer at a steady pace — not rushed, not dragging.",
    confidence: "(Mock tip) Pause silently instead of using filler words when you need a moment to think.",
  }

  return {
    contentScore,
    clarityScore,
    confidenceScore,
    feedback: feedbackByArea[weakest],
    improvementTip: tipByArea[weakest],
  }
}

// ---------- Public API ----------

// Called ONCE per interview with every question/answer/metrics triple.
// Practice Mode is scored locally; Full AI Mode goes through /api/evaluate,
// which verifies the Firebase login and holds the Gemini key server-side.
//
// qas: [{ question, answer, metrics: { fillerCount, wpm, responseDelaySec } }, ...]
export async function evaluateSession({ role, seniority, qas, mock = false }) {
  if (MOCK_MODE || mock) {
    await mockDelay()
    return {
      evaluations: qas.map((qa) => mockEvaluation(qa.answer, qa.metrics)),
      overallSummary:
        "Solid overall performance — focus on trimming filler words and keeping a steady pace. (Practice Mode: locally scored, not real AI feedback.)",
    }
  }

  return callBackend({
    role,
    seniority,
    qas: qas.map(({ question, answer, metrics }) => ({ question, answer, metrics })),
  })
}