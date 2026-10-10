// Single source of truth for the interview options.
// Imported by the React app (through src/lib/Options.js) AND the serverless function,
// so the two can never drift apart.

export const ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst / Data Scientist",
  "QA / Test Engineer",
  "Tech Support / IT Support",
  "Product Manager",
  "UI/UX Designer",
]

export const SENIORITIES = ["Entry-level", "Mid-level", "Senior"]

// The dropdown shows ROLES plus this entry. When it is chosen, the free-text role is used instead.
export const CUSTOM_ROLE = "Custom role"
export const MIN_ROLE_CHARS = 2
export const MAX_ROLE_CHARS = 60 // [rules] firestore.rules allows role strings up to 60 characters

export const SESSION_LENGTHS = [3, 6, 10]
export const DEFAULT_SESSION_LENGTH = 6

export const QUESTION_TYPES = [
  { id: "mixed", label: "Mixed" },
  { id: "behavioral", label: "Behavioral" },
  { id: "technical", label: "Technical" },
]

// A custom role ends up inside AI prompts, so it is reduced to a plain title: letters, numbers,
// spaces and a little punctuation. No angle brackets, quotes or line breaks.
export function sanitizeRole(text) {
  if (typeof text !== "string") return ""
  return text
    .replace(/[^\p{L}\p{N} /&+.,#()'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ROLE_CHARS)
    .trim()
}