// The real lists live in shared/options.js so the serverless function can import them too.
// This file just re-exports them, so imports in the app keep working.
export {
  ROLES,
  SENIORITIES,
  CUSTOM_ROLE,
  MIN_ROLE_CHARS,
  MAX_ROLE_CHARS,
  SESSION_LENGTHS,
  DEFAULT_SESSION_LENGTH,
  QUESTION_TYPES,
  sanitizeRole,
} from "../../shared/options.js"