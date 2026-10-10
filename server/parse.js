import { HttpError } from "./errors.js"
import { clampScore, clampText } from "./utils.js"
import {
  MAX_FEEDBACK_CHARS,
  MAX_TIP_CHARS,
  MAX_STRONG_ANSWER_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_GENERATED_QUESTION_CHARS,
  MAX_FOLLOWUP_CHARS,
} from "../shared/limits.js"

export function parseJson(rawText) {
  try {
    return JSON.parse(rawText)
  } catch (err) {
    // Log the size, not the content: transcripts are personal data.
    console.error("Failed to parse Gemini JSON:", err.message, `(length ${rawText.length})`)
    throw new HttpError(502, "The AI returned an unreadable response.", {}, { refund: "capped" })
  }
}

// STAR only applies to behavioral questions; everything else gets null.
export function normalizeStar(e) {
  if (e?.isBehavioral !== true) return null
  return {
    situation: e.starSituation === true,
    task: e.starTask === true,
    action: e.starAction === true,
    result: e.starResult === true,
  }
}

export function parseAndNormalize(rawText, expectedCount) {
  const parsed = parseJson(rawText)

  if (!Array.isArray(parsed?.evaluations) || parsed.evaluations.length !== expectedCount) {
    console.error("Evaluation count mismatch", expectedCount, parsed?.evaluations?.length)
    throw new HttpError(502, "The AI response didn't match the questions asked.", {}, { refund: "capped" })
  }

  return {
    evaluations: parsed.evaluations.map((e) => ({
      contentScore: clampScore(e?.contentScore),
      clarityScore: clampScore(e?.clarityScore),
      confidenceScore: clampScore(e?.confidenceScore),
      feedback: clampText(e?.feedback, MAX_FEEDBACK_CHARS),
      improvementTip: clampText(e?.improvementTip, MAX_TIP_CHARS),
      star: normalizeStar(e),
      strongAnswer: clampText(e?.strongAnswer, MAX_STRONG_ANSWER_CHARS),
    })),
    overallSummary: clampText(parsed.overallSummary, MAX_SUMMARY_CHARS),
  }
}

export function parseQuestions(rawText, expectedCount) {
  const parsed = parseJson(rawText)
  const seen = new Set()
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map((q) => clampText(q, MAX_GENERATED_QUESTION_CHARS).trim())
    .filter((q) => {
      if (!q || seen.has(q)) return false
      seen.add(q)
      return true
    })

  if (questions.length < expectedCount) {
    console.error("Generated question count mismatch", expectedCount, questions.length)
    throw new HttpError(502, "The AI didn't return enough questions.", {}, { refund: "capped" })
  }
  return questions.slice(0, expectedCount)
}

export function parseFollowUp(rawText) {
  const parsed = parseJson(rawText)
  const question = clampText(parsed?.followUp, MAX_FOLLOWUP_CHARS).trim()
  if (!question) {
    console.error("Empty follow-up question from Gemini")
    throw new HttpError(502, "The AI didn't return a follow-up.", {}, { refund: "capped" })
  }
  return question
}
