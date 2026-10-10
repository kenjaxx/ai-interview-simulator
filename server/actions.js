import { peekUsage } from "./rateLimit.js"
import { HttpError } from "./errors.js"
import { callGemini } from "./gemini.js"
import { validateEvaluateInput, validateQuestionsInput, validateFollowUpInput } from "./validate.js"
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildEvaluationSchema,
  buildQuestionsSystemPrompt,
  buildQuestionsUserPrompt,
  buildQuestionsSchema,
  buildFollowUpSystemPrompt,
  buildFollowUpUserPrompt,
  buildFollowUpSchema,
} from "./prompts.js"
import { parseAndNormalize, parseQuestions, parseFollowUp } from "./parse.js"

// Every action receives { uid, body, reserve } and returns the JSON payload to send back.
// reserve() spends one of the user's evaluations. It is only called AFTER the input is validated,
// so bad requests never cost quota. The handler refunds the reservation if the action then fails.

const usageOf = (reservation) => ({ remaining: reservation.remaining, limit: reservation.limit })

// Read-only: how many evaluations are left. Spends nothing.
export async function usageAction({ uid }) {
  try {
    return { usage: await peekUsage(uid) }
  } catch (err) {
    console.error("Usage lookup failed:", err.message)
    throw new HttpError(503, "Couldn't check your usage right now.")
  }
}

// Tailored questions from a pasted job description. Costs one evaluation.
export async function questionsAction({ body, reserve }) {
  const input = validateQuestionsInput(body)
  const reservation = await reserve()

  const rawText = await callGemini(
    buildQuestionsSystemPrompt(input),
    buildQuestionsUserPrompt(input),
    buildQuestionsSchema(input.count),
    0.7
  )
  return { questions: parseQuestions(rawText, input.count), usage: usageOf(reservation) }
}

// One probing follow-up question for a single answer. Costs one evaluation.
export async function followUpAction({ body, reserve }) {
  const input = validateFollowUpInput(body)
  const reservation = await reserve()

  const rawText = await callGemini(
    buildFollowUpSystemPrompt(input),
    buildFollowUpUserPrompt(input),
    buildFollowUpSchema(),
    0.7
  )
  return { question: parseFollowUp(rawText), usage: usageOf(reservation) }
}

// Default: score a set of answers (a whole interview, or a single retried answer).
export async function evaluateAction({ body, reserve }) {
  const { role, seniority, qas } = validateEvaluateInput(body)
  const reservation = await reserve()

  const rawText = await callGemini(
    buildSystemPrompt(role, seniority),
    buildUserPrompt(qas),
    buildEvaluationSchema(qas.length),
    0.3
  )
  return { ...parseAndNormalize(rawText, qas.length), usage: usageOf(reservation) }
}
