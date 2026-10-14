export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function clampNumber(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export const clampScore = (v) => Math.round(clampNumber(v, 0, 100))
export const clampText = (v, max) => (typeof v === "string" ? v.slice(0, max) : "")

// Answers and job descriptions are untrusted text that goes into the prompt. Their angle brackets
// are escaped (< becomes &lt; and > becomes &gt;), so they can never close our tags early or open
// new ones, while things like List<String> or "a < b" still reach the model in readable form.
// Ampersands are left alone: on their own they can't form a tag, and "R&D" should stay "R&D".
// The prompts tell the model how to read the escaped characters (see escapeNote in prompts.js).
export const escapeTags = (text) =>
  String(text ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")