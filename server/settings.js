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
// The fallback is tried once if the primary fails transiently (overloaded, rate-limited, unreachable).
// Quotas are tracked per model, so a different fallback can still work when the primary is exhausted.
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash"
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"
export const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export const MAX_OUTPUT_TOKENS = 8192 // generous, because "thinking" tokens can count toward this on some models

// Time budget. The function is killed at maxDuration (60s), so everything, including a retry, has to
// fit well inside that or the user gets a hard platform timeout instead of a clean error.
export const TOTAL_BUDGET_MS = 52_000
export const ATTEMPT_TIMEOUT_MS = 40_000
export const MIN_RETRY_WINDOW_MS = 8_000 // don't start a second attempt with less time than this left
export const SHORT_RETRY_SEC = 10 // a 429 asking us to wait longer than this isn't worth retrying on the same model

// ---------- allowed values ----------
export const ROLES = new Set(ROLE_LIST)
export const SENIORITIES = new Set(SENIORITY_LIST)
