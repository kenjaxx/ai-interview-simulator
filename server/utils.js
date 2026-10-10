export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function clampNumber(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export const clampScore = (v) => Math.round(clampNumber(v, 0, 100))
export const clampText = (v, max) => (typeof v === "string" ? v.slice(0, max) : "")

// Answers and job descriptions are untrusted text that goes into the prompt. Removing angle brackets
// means they can never close our tags early and pretend to be instructions.
export const stripTags = (text) => text.replace(/[<>]/g, "")
