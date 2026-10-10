// Tells behavioral questions ("Tell me about a time...") apart from technical / practical ones.
// The bank is plain strings, so this is a small pattern check rather than stored tags.

const BEHAVIORAL = /^(tell me about|describe)\b|you've ever|taught yourself|^why are you interested/i

export function isBehavioral(question) {
  return BEHAVIORAL.test(String(question ?? "").trim())
}

// type: "mixed" | "behavioral" | "technical"
export function matchesType(question, type) {
  if (type === "behavioral") return isBehavioral(question)
  if (type === "technical") return !isBehavioral(question)
  return true
}