import { ROLES, SENIORITIES, MIN_ROLE_CHARS, sanitizeRole } from "./options"
import {
  MAX_QAS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
  MAX_FEEDBACK_CHARS,
  MAX_TIP_CHARS,
  MAX_STRONG_ANSWER_CHARS,
  MAX_SUMMARY_CHARS,
} from "./limits"

// A finished session kept in sessionStorage, so reloading the summary screen brings it back instead
// of dropping the user on the setup screen. sessionStorage is per tab and is wiped when the tab
// closes, so nothing outlives the browsing session.
//
// The stored value is untrusted (it can be edited in devtools), so loadSummary() re-validates every
// field and throws the whole thing away if anything looks wrong.

const KEY = "interview-ai-summary"
const VERSION = 1
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // older than this is ignored
const MAX_ID_CHARS = 100
const SAVE_STATUSES = ["idle", "saving", "saved", "error", "skipped"]

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "")
const score = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null)
const bounded = (v, max) => (Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0)
const mode = (v) => (v === "full" || v === "practice" ? v : null)

function cleanMetrics(m) {
  const raw = isObject(m) ? m : {}
  return {
    wpm: bounded(raw.wpm, 600),
    fillerCount: bounded(raw.fillerCount, 1000),
    responseDelaySec: bounded(raw.responseDelaySec, 600),
  }
}

function cleanStar(s) {
  if (!isObject(s)) return null
  return {
    situation: s.situation === true,
    task: s.task === true,
    action: s.action === true,
    result: s.result === true,
  }
}

function cleanEvaluation(e) {
  if (!isObject(e)) return null
  const contentScore = score(e.contentScore)
  const clarityScore = score(e.clarityScore)
  const confidenceScore = score(e.confidenceScore)
  if (contentScore === null || clarityScore === null || confidenceScore === null) return null
  return {
    contentScore,
    clarityScore,
    confidenceScore,
    feedback: text(e.feedback, MAX_FEEDBACK_CHARS),
    improvementTip: text(e.improvementTip, MAX_TIP_CHARS),
    star: cleanStar(e.star),
    strongAnswer: text(e.strongAnswer, MAX_STRONG_ANSWER_CHARS),
  }
}

function cleanEntry(entry) {
  if (!isObject(entry)) return null
  const question = text(entry.question, MAX_QUESTION_CHARS)
  if (!question) return null
  const evaluation = cleanEvaluation(entry.evaluation)
  if (!evaluation) return null
  return {
    question,
    answer: text(entry.answer, MAX_ANSWER_CHARS),
    inputMethod: entry.inputMethod === "text" ? "text" : "voice",
    isFollowUp: entry.isFollowUp === true,
    metrics: cleanMetrics(entry.metrics),
    evaluation,
  }
}

// Retry results are keyed by the index of the answer that was retried. Bad entries are dropped.
function cleanRetryResults(raw, count) {
  const out = {}
  if (!isObject(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= count || !isObject(value)) continue
    const evaluation = cleanEvaluation(value.evaluation)
    const retryMode = mode(value.mode)
    if (!evaluation || !retryMode) continue
    out[index] = {
      answer: text(value.answer, MAX_ANSWER_CHARS),
      inputMethod: value.inputMethod === "text" ? "text" : "voice",
      metrics: cleanMetrics(value.metrics),
      evaluation,
      mode: retryMode,
    }
  }
  return out
}

// Returns a clean summary, or null if the raw value isn't a valid one for this user.
function validate(raw, uid) {
  if (!isObject(raw) || raw.v !== VERSION || raw.uid !== uid) return null
  if (typeof raw.savedAt !== "number" || Date.now() - raw.savedAt > MAX_AGE_MS || raw.savedAt > Date.now()) {
    return null
  }

  const m = raw.meta
  if (!isObject(m)) return null
  const role = typeof m.role === "string" ? (ROLES.includes(m.role) ? m.role : sanitizeRole(m.role)) : ""
  if (role.length < MIN_ROLE_CHARS) return null
  if (!SENIORITIES.includes(m.seniority)) return null
  const metaMode = mode(m.mode)
  const sessionMode = mode(raw.sessionMode)
  if (!metaMode || !sessionMode) return null

  if (!Array.isArray(raw.session) || raw.session.length < 1 || raw.session.length > MAX_QAS) return null
  const session = raw.session.map(cleanEntry)
  if (session.some((entry) => entry === null)) return null

  if (!SAVE_STATUSES.includes(raw.saveStatus)) return null
  const saveSessionId =
    typeof raw.saveSessionId === "string" && raw.saveSessionId.length > 0 && raw.saveSessionId.length <= MAX_ID_CHARS
      ? raw.saveSessionId
      : null

  const parsedDate = new Date(m.date)
  const date = Number.isNaN(parsedDate.getTime()) ? new Date(raw.savedAt) : parsedDate

  const usage =
    isObject(raw.usage) && Number.isFinite(raw.usage.remaining) && Number.isFinite(raw.usage.limit)
      ? { remaining: raw.usage.remaining, limit: raw.usage.limit }
      : null

  return {
    session,
    meta: { role, seniority: m.seniority, mode: metaMode, date },
    overallSummary: text(raw.overallSummary, MAX_SUMMARY_CHARS),
    usage,
    sessionMode,
    saveStatus: raw.saveStatus,
    saveSessionId,
    retryResults: cleanRetryResults(raw.retryResults, session.length),
  }
}

// sessionStorage can throw (blocked site data, full quota, sandboxed frames). Never let that break
// the app: this is a convenience.
export function saveSummary(summary) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...summary, v: VERSION, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}

export function loadSummary(uid) {
  if (!uid || typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const summary = validate(JSON.parse(raw), uid)
    if (!summary) window.sessionStorage.removeItem(KEY)
    return summary
  } catch {
    return null
  }
}

export function clearSummary() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}