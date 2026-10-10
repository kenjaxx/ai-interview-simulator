import { readStored, writeStored } from "./Storage"
import { GENERAL_QUESTIONS, SENIORITY_QUESTIONS, ROLE_QUESTIONS } from "./questionBank"
import { matchesType } from "./questionTypes"

// Picks the questions for one session from the local bank, so it costs no API call.
// Each session guarantees a few role-specific and seniority-specific questions, then fills the
// rest with general ones. Questions asked in recent sessions are pushed to the back of the line,
// so repeat sessions feel fresh. Optional "custom" questions (generated from a job description)
// take priority over the bank.
//
// The type option narrows the bank: "behavioral" keeps past-experience questions, "technical"
// keeps the rest and uses the role's own questions first. If the filter leaves too few questions
// (for example a custom role), the list is topped up from the unfiltered bank.

const ROLE_QUOTA = 3 // role-specific questions guaranteed per session (when the role has them)
const LEVEL_QUOTA = 1 // seniority-specific questions guaranteed per session
const ROLE_QUOTA_WITH_CUSTOM = 1 // fewer bank questions when tailored ones are included

const RECENT_KEY = "interview-ai-recent-questions"
const RECENT_MAX = 60

// ---------- recently asked questions ----------

// Oldest first, newest last.
export function getRecentQuestions() {
  try {
    const parsed = JSON.parse(readStored(RECENT_KEY, "[]"))
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === "string") : []
  } catch {
    return []
  }
}

export function rememberQuestions(questions) {
  const recent = getRecentQuestions().filter((q) => !questions.includes(q))
  writeStored(RECENT_KEY, JSON.stringify([...recent, ...questions].slice(-RECENT_MAX)))
}

// ---------- picking ----------

// Fisher-Yates shuffle, doesn't mutate the input array.
function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Shuffled, then sorted so never-asked questions come first, followed by the ones asked longest ago.
function orderByFreshness(pool, recent) {
  return shuffle(pool)
    .map((q) => ({ q, rank: recent.lastIndexOf(q) })) // -1 = never asked
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.q)
}

// Builds a `count`-length list. Custom (job-description) questions go in first, then
// role-specific and seniority-specific bank questions, then general ones. Within every pool,
// questions that haven't been asked recently win. The final order is shuffled.
//   options.recent  questions asked in earlier sessions (oldest first)
//   options.custom  extra questions that should always be included
//   options.type    "mixed" (default) | "behavioral" | "technical"
export function pickQuestions(role, seniority, count, { recent = [], custom = [], type = "mixed" } = {}) {
  const roleAll = ROLE_QUESTIONS[role] || []
  const levelAll = SENIORITY_QUESTIONS[seniority] || []
  const fresh = (pool) => orderByFreshness(pool, recent)
  const filtered = (pool) => fresh(pool.filter((q) => matchesType(q, type)))

  const roleQs = filtered(roleAll)
  const levelQs = filtered(levelAll)
  const general = filtered(GENERAL_QUESTIONS)

  const picked = []
  const seen = new Set()
  const add = (q) => {
    if (!q || seen.has(q) || picked.length >= count) return
    seen.add(q)
    picked.push(q)
  }

  // A technical session leans on the role's own questions as far as they go.
  const roleQuota = type === "technical" ? count : custom.length ? ROLE_QUOTA_WITH_CUSTOM : ROLE_QUOTA

  custom.forEach(add)
  roleQs.slice(0, roleQuota).forEach(add)
  levelQs.slice(0, LEVEL_QUOTA).forEach(add)
  general.forEach(add)
  ;[...roleQs, ...levelQs].forEach(add)
  // Not enough of the requested type: top up from the rest of the bank.
  ;[...fresh(roleAll), ...fresh(levelAll), ...fresh(GENERAL_QUESTIONS)].forEach(add)

  return shuffle(picked)
}