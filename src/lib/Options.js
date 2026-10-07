// The real list lives in shared/options.js so the serverless function can import it too.
// This file just re-exports it, so existing imports in the app keep working.
export { ROLES, SENIORITIES } from "../../shared/options.js"