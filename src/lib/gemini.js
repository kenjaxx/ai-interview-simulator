import { messageForError } from "./Errormessages"
import { callBackend } from "./backend"
import { mockDelay, mockEvaluation } from "./mockEvaluation"

export { GeminiApiError } from "./apiError"

// Set VITE_MOCK_AI=true in your .env to bypass the backend entirely during
// UI/dev work: zero quota spent, instant fake responses.
const MOCK_MODE = import.meta.env.VITE_MOCK_AI === "true"

// Scores a set of Q&As in one call: a whole interview, or a single retried answer.
// Practice Mode is scored locally; Full AI Mode goes through /api/evaluate,
// which verifies the Firebase login (and App Check), enforces usage limits, and holds the Gemini key server-side.
//
// qas: [{ question, answer, inputMethod, metrics: { fillerCount, wpm, responseDelaySec } }, ...]
//
// Returns: { evaluations, overallSummary, usage }
//   usage is { remaining, limit } for Full AI Mode, or null when scored locally.
export async function evaluateSession({ role, seniority, qas, mock = false }) {
  if (MOCK_MODE || mock) {
    await mockDelay()
    return {
      evaluations: qas.map((qa) => mockEvaluation(qa.answer, qa.metrics, qa.inputMethod)),
      overallSummary:
        "Solid overall performance — focus on trimming filler words and keeping a steady pace. (Practice Mode: locally scored, not real AI feedback.)",
      usage: null,
    }
  }

  const body = await callBackend(
    {
      role,
      seniority,
      // inputMethod must be sent, otherwise the server assumes "voice" and judges
      // typed answers against pace/delay metrics that don't exist for them.
      qas: qas.map(({ question, answer, metrics, inputMethod, isFollowUp }) => ({
        question,
        answer,
        metrics,
        inputMethod: inputMethod === "text" ? "text" : "voice",
        isFollowUp: !!isFollowUp,
      })),
    },
    (b) => Array.isArray(b.evaluations)
  )

  return {
    evaluations: body.evaluations.map((e) => ({
      ...e,
      star: e.star ?? null,
      strongAnswer: e.strongAnswer ?? "",
    })),
    overallSummary: body.overallSummary || "",
    usage: body.usage ?? null,
  }
}

// The reason the last quota check failed, in words a user can act on ("" when it succeeded).
// The quota meter shows this under its Retry button.
let lastUsageError = ""
export function getUsageError() {
  return lastUsageError
}

// Worth one more try: the request never arrived, or the server hiccuped.
const isTransient = (err) => err && (err.status === 0 || err.status >= 500)

const usageIsValid = (b) => typeof b?.usage?.remaining === "number" && typeof b?.usage?.limit === "number"

// How many AI evaluations are left today. Spends nothing. Retries once on a transient failure.
// Returns { remaining, limit, globalExhausted }, or null in mock mode.
export async function fetchUsage() {
  if (MOCK_MODE) return null

  try {
    let body
    try {
      body = await callBackend({ action: "usage" }, usageIsValid)
    } catch (err) {
      if (!isTransient(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, 1200))
      body = await callBackend({ action: "usage" }, usageIsValid)
    }
    lastUsageError = ""
    return body.usage
  } catch (err) {
    lastUsageError = messageForError(err)
    throw err
  }
}

// Asks Gemini for interview questions tailored to a pasted job description. Costs one AI evaluation.
// Returns { questions: string[], usage }.
export async function generateQuestions({ role, seniority, jobDescription, count }) {
  if (MOCK_MODE) {
    await mockDelay()
    return {
      questions: Array.from(
        { length: count },
        (_, i) => `(Mock) Tailored question ${i + 1} for a ${seniority} ${role}.`
      ),
      usage: null,
    }
  }
  const body = await callBackend({ action: "questions", role, seniority, jobDescription, count }, (b) =>
    Array.isArray(b.questions)
  )
  return { questions: body.questions, usage: body.usage ?? null }
}

// Asks Gemini for ONE probing follow-up to a single answer. Costs one AI evaluation.
// Returns { question: string, usage }.
export async function generateFollowUp({ role, seniority, question, answer }) {
  if (MOCK_MODE) {
    await mockDelay()
    return { question: "(Mock) Can you walk me through a concrete example of that?", usage: null }
  }
  const body = await callBackend(
    { action: "followup", role, seniority, question, answer },
    (b) => typeof b?.question === "string" && b.question.trim().length > 0
  )
  return { question: body.question, usage: body.usage ?? null }
}
