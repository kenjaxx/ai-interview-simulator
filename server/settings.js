import { ROLES as ROLE_LIST, SENIORITIES as SENIORITY_LIST } from "../shared/options.js"

// ---------- environment ----------
export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Firebase App Check. FIREBASE_PROJECT_NUMBER is the numeric "Project number" in Firebase project
// settings (it's the same value as the web app's messagingSenderId).
// Set APP_CHECK_ENFORCE=true to reject requests without a valid token. Until then the server runs in
// monitor mode: a valid token is checked and logged if bad, but nothing is blocked. That lets you
// roll App Check out and watch the logs before turning it on.
export const PROJECT_NUMBER = process.env.FIREBASE_PROJECT_NUMBER
export const APP_CHECK_ENFORCE = process.env.APP_CHECK_ENFORCE === "true"

// ---------- Gemini ----------
// Override with GEMINI_MODEL / GEMINI_FALLBACK_MODEL. You can list the models your key can use at
// https://generativelanguage.googleapis.com/v1beta/models (send your key in the x-goog-api-key header).
// The fallback is tried once if the primary fails transiently (overloaded, rate-limited, timed out,
// unreachable). Quotas are tracked per model, so a different fallback can still work when the
// primary is exhausted.
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash"
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"
export const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

// Time and token budgets per kind of request. The function is killed at maxDuration (60s), so
// every profile has to fit well inside that, including a retry, or the user gets a hard platform
// timeout instead of a clean error.
//   maxOutputTokens   generous, because "thinking" tokens can count toward this on some models
//   attemptTimeoutMs  one try on one model. Kept well under half the total budget, so a slow first
//                     attempt still leaves room for a real retry on the fallback model.
//   totalBudgetMs     everything, including the wait and the second attempt
// Small outputs (a follow-up, three questions) get small budgets: the user is waiting on them live,
// and a stuck request should fail over quickly instead of holding the interview.
export const GEMINI_PROFILES = {
  evaluate: { maxOutputTokens: 8192, attemptTimeoutMs: 30_000, totalBudgetMs: 52_000 },
  questions: { maxOutputTokens: 2048, attemptTimeoutMs: 20_000, totalBudgetMs: 40_000 },
  followup: { maxOutputTokens: 2048, attemptTimeoutMs: 15_000, totalBudgetMs: 30_000 },
}

export const MIN_RETRY_WINDOW_MS = 8_000 // don't start a second attempt with less time than this left
export const SHORT_RETRY_SEC = 10 // a 429 asking us to wait longer than this isn't worth retrying on the same model

// ---------- allowed values ----------
export const ROLES = new Set(ROLE_LIST)
export const SENIORITIES = new Set(SENIORITY_LIST)