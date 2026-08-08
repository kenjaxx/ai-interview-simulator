const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = "gemini-3.6-flash"
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Set VITE_MOCK_AI=true in your .env to bypass the real API entirely during
// UI/dev work — zero quota spent, instant fake responses.
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

function parseRetryDelaySeconds(errorBody) {
  try {
    const details = errorBody?.error?.details || []
    const retryInfo = details.find(d => d["@type"]?.includes("RetryInfo"))
    const raw = retryInfo?.retryDelay
    if (!raw) return null
    const seconds = parseFloat(raw.replace("s", ""))
    return Number.isFinite(seconds) ? Math.ceil(seconds) : null
  } catch {
    return null
  }
}

async function callGemini(systemPrompt, userPrompt, expectJson = false) {
  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: expectJson ? { responseMimeType: "application/json" } : {},
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch { /* not JSON, ignore */ }

    if (res.status === 429) {
      const retryAfterSeconds = parseRetryDelaySeconds(errBody)
      const isDailyQuota = errBody?.error?.details?.some(d =>
        d.violations?.some(v => v.quotaId?.toLowerCase().includes("perday"))
      )
      throw new GeminiApiError(
        isDailyQuota
          ? "You've hit today's free-tier request limit for this model."
          : "Too many requests right now — the API is rate-limiting you.",
        { status: 429, isQuotaError: true, isDailyQuota, retryAfterSeconds }
      )
    }

    throw new GeminiApiError(
      `Gemini API error (${res.status}): ${errBody ? JSON.stringify(errBody) : await res.text()}`,
      { status: res.status }
    )
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiApiError("No response text from Gemini", { status: res.status })
  return text
}

function parseJsonResponse(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  const jsonText = match ? match[0] : cleaned
  return JSON.parse(jsonText)
}

// ---------- Mock helpers (used only when MOCK_MODE is on) ----------

function mockDelay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Heuristic, metrics-based mock evaluation for a single Q&A — used only
// when MOCK_MODE is on, so the batched mock path can still return per-answer
// results without any real AI judgment.
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
    confidence: fillerCount > 0
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

// The ONLY function that touches the AI. Call this ONCE, after the whole
// interview is done, with every question/answer/metrics triple. Returns one
// evaluation per turn (same order as `qas`) plus a short overall summary.
// This is what lets feedback stay genuinely based on your actual answers
// while costing exactly 1 API request per interview instead of 1-per-answer.
//
// qas: [{ question, answer, metrics: { fillerCount, wpm, responseDelaySec } }, ...]
export async function evaluateSession({ role, seniority, qas, mock = false }) {
  const useMock = MOCK_MODE || mock

  if (useMock) {
    await mockDelay()
    const evaluations = qas.map(qa => mockEvaluation(qa.answer, qa.metrics))
    return {
      evaluations,
      overallSummary: "Solid overall performance — focus on trimming filler words and keeping a steady pace. (Practice Mode: locally scored, not real AI feedback.)",
    }
  }

  const systemPrompt = `You are an interview coach reviewing a completed mock interview for a ${seniority} ${role} position. You will receive every question asked, the candidate's transcribed answer to each, and objective speech metrics already computed per answer (do not recompute them, just factor them in).

For EACH question/answer pair, evaluate it independently based on its own content and metrics. Then write one short overall summary of the whole session.

Return ONLY valid JSON, no markdown formatting, in exactly this shape:
{
  "evaluations": [
    {
      "contentScore": <0-100 integer>,
      "clarityScore": <0-100 integer, based on structure and the provided metrics>,
      "confidenceScore": <0-100 integer, based on pacing and filler word rate from metrics>,
      "feedback": "<2-3 sentences of specific, constructive feedback for THIS answer>",
      "improvementTip": "<one concrete, actionable tip for THIS answer>"
    }
  ],
  "overallSummary": "<2-3 sentences summarizing patterns across the whole interview>"
}
The "evaluations" array must have exactly one entry per question/answer pair, in the same order they were given.`

  const qaBlocks = qas.map((qa, i) => {
    const trimmedAnswer = qa.answer.length > 4000 ? qa.answer.slice(0, 4000) + " [...]" : qa.answer
    return `Question ${i + 1}: ${qa.question}\nAnswer ${i + 1}: ${trimmedAnswer}\nMetrics ${i + 1}: filler words=${qa.metrics.fillerCount}, wpm=${qa.metrics.wpm}, response delay=${qa.metrics.responseDelaySec}s`
  }).join("\n\n")

  const rawText = await callGemini(systemPrompt, qaBlocks, true)

  let parsed
  try {
    parsed = parseJsonResponse(rawText)
  } catch (err) {
    throw new GeminiApiError(`Failed to parse session evaluation response: ${err.message}`)
  }

  if (!Array.isArray(parsed.evaluations) || parsed.evaluations.length !== qas.length) {
    throw new GeminiApiError("Evaluation response didn't match the number of questions asked")
  }

  return parsed
}