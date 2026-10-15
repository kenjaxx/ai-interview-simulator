import { ROLES, SENIORITIES, MIN_ROLE_CHARS, sanitizeRole } from "./options"
import { MAX_QAS, MAX_QUESTION_CHARS, MAX_ANSWER_CHARS } from "./limits"
import { MAX_FOLLOW_UPS } from "./interviewConfig"

// An interview in progress, kept in sessionStorage so a refresh doesn't lose it.
// sessionStorage is per tab and is wiped when the tab closes, so nothing outlives the session.
//
// The stored value is untrusted (the user can edit it in devtools), so loadDraft() re-validates every
// field and throws the whole draft away if anything looks wrong.
//
// Not saved: a transcript that is waiting for review, and an answer that is still being spoken.

const KEY = "interview-ai-draft"
const VERSION = 1
const MAX_AGE_MS = 3 * 60 * 60 * 1000 // a draft older than this is ignored
const MAX_QUESTIONS = 10 // the longest session (see SESSION_LENGTHS)
const MAX_NOTE_CHARS = 300

const isText = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
const bounded = (v, max) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0)

function cleanQa(qa) {
  if (!qa || typeof qa !== "object") return null
  if (!isText(qa.question, MAX_QUESTION_CHARS)) return null
  if (typeof qa.answer !== "string" || qa.answer.length > MAX_ANSWER_CHARS) return null
  const m = qa.metrics && typeof qa.metrics === "object" ? qa.metrics : {}
  return {
    question: qa.question,
    answer: qa.answer,
    inputMethod: qa.inputMethod === "text" ? "text" : "voice",
    isFollowUp: qa.isFollowUp === true,
    metrics: {
      wpm: bounded(m.wpm, 600),
      fillerCount: bounded(m.fillerCount, 1000),
      responseDelaySec: bounded(m.responseDelaySec, 600),
    },
  }
}

// Returns a clean draft, or null if the raw value isn't a valid draft for this user.
function validate(raw, uid) {
  if (!raw || typeof raw !== "object" || raw.v !== VERSION || raw.uid !== uid) return null
  if (typeof raw.savedAt !== "number" || Date.now() - raw.savedAt > MAX_AGE_MS || raw.savedAt > Date.now()) {
    return null
  }

  const c = raw.config
  if (!c || typeof c !== "object") return null
  const role = typeof c.role === "string" ? (ROLES.includes(c.role) ? c.role : sanitizeRole(c.role)) : ""
  if (role.length < MIN_ROLE_CHARS) return null
  if (!SENIORITIES.includes(c.seniority)) return null
  if (c.mode !== "practice" && c.mode !== "full") return null
  const config = {
    role,
    seniority: c.seniority,
    mode: c.mode,
    save: c.save !== false,
    followUps: c.followUps === true,
  }

  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > MAX_QUESTIONS) {
    return null
  }
  if (!raw.questions.every((q) => isText(q, MAX_QUESTION_CHARS))) return null

  if (!Array.isArray(raw.qas) || raw.qas.length > MAX_QAS) return null
  const qas = raw.qas.map(cleanQa)
  if (qas.some((qa) => qa === null)) return null

  if (!isInt(raw.questionIndex, 0, raw.questions.length - 1)) return null
  if (!isText(raw.currentQuestion, MAX_QUESTION_CHARS)) return null
  if (!isInt(raw.followUpsUsed, 0, MAX_FOLLOW_UPS)) return null

  return {
    config,
    questions: raw.questions,
    questionIndex: raw.questionIndex,
    qas,
    currentQuestion: raw.currentQuestion,
    isFollowUp: raw.isFollowUp === true,
    followUpsUsed: raw.followUpsUsed,
    inputMode: raw.inputMode === "text" ? "text" : "voice",
    note: typeof raw.note === "string" ? raw.note.slice(0, MAX_NOTE_CHARS) : null,
    finished: raw.finished === true, // all answers are in and the final scoring was running
    savedAt: raw.savedAt,
  }
}

// sessionStorage can throw (blocked site data, full quota, sandboxed frames). Never let that
// break the interview: the draft is a convenience.
export function saveDraft(draft) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, v: VERSION, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}

export function loadDraft(uid) {
  if (!uid || typeof window === "undefined") return null
  try {
    const text = window.sessionStorage.getItem(KEY)
    if (!text) return null
    const draft = validate(JSON.parse(text), uid)
    if (!draft) window.sessionStorage.removeItem(KEY)
    return draft
  } catch {
    return null
  }
}

export function clearDraft() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}