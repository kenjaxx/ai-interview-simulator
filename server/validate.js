import { ROLES, SENIORITIES } from "./settings.js"
import { HttpError } from "./errors.js"
import { clampNumber, clampText } from "./utils.js"
import {
  MIN_JD_CHARS,
  MAX_JD_CHARS,
  MAX_GENERATED_QUESTIONS,
  MIN_FOLLOWUP_ANSWER_CHARS,
  MAX_QAS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
  MAX_TOTAL_CHARS,
} from "../shared/limits.js"

export function validateRoleAndSeniority(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request.")
  const { role, seniority } = body
  if (!ROLES.has(role)) throw new HttpError(400, "Invalid role.")
  if (!SENIORITIES.has(seniority)) throw new HttpError(400, "Invalid seniority.")
  return { role, seniority }
}

export function validateEvaluateInput(body) {
  const { role, seniority } = validateRoleAndSeniority(body)
  const { qas } = body

  if (!Array.isArray(qas) || qas.length < 1 || qas.length > MAX_QAS) {
    throw new HttpError(400, `Expected between 1 and ${MAX_QAS} answers.`)
  }

  const cleanQas = qas.map((qa) => ({
    question: clampText(qa?.question, MAX_QUESTION_CHARS),
    answer: clampText(qa?.answer, MAX_ANSWER_CHARS),
    inputMethod: qa?.inputMethod === "text" ? "text" : "voice",
    isFollowUp: qa?.isFollowUp === true,
    metrics: {
      fillerCount: Math.round(clampNumber(qa?.metrics?.fillerCount, 0, 1000)),
      wpm: Math.round(clampNumber(qa?.metrics?.wpm, 0, 600)),
      responseDelaySec: clampNumber(qa?.metrics?.responseDelaySec, 0, 600),
    },
  }))

  if (cleanQas.some((qa) => !qa.question)) throw new HttpError(400, "Every entry needs a question.")

  const totalChars = cleanQas.reduce((sum, qa) => sum + qa.question.length + qa.answer.length, 0)
  if (totalChars > MAX_TOTAL_CHARS) throw new HttpError(400, "That interview is too long to evaluate.")

  return { role, seniority, qas: cleanQas }
}

export function validateQuestionsInput(body) {
  const { role, seniority } = validateRoleAndSeniority(body)
  const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription.trim() : ""

  if (jobDescription.length < MIN_JD_CHARS) {
    throw new HttpError(400, "Paste a longer job description (at least a couple of sentences).")
  }
  if (jobDescription.length > MAX_JD_CHARS) {
    throw new HttpError(400, `That job description is too long (max ${MAX_JD_CHARS} characters).`)
  }

  const count = Math.round(clampNumber(body.count, 1, MAX_GENERATED_QUESTIONS))
  return { role, seniority, jobDescription, count }
}

export function validateFollowUpInput(body) {
  const { role, seniority } = validateRoleAndSeniority(body)
  const question = clampText(body.question, MAX_QUESTION_CHARS).trim()
  const answer = clampText(body.answer, MAX_ANSWER_CHARS).trim()
  if (!question) throw new HttpError(400, "Every entry needs a question.")
  if (answer.length < MIN_FOLLOWUP_ANSWER_CHARS) {
    throw new HttpError(400, "That answer is too short to follow up on.")
  }
  return { role, seniority, question, answer }
}
