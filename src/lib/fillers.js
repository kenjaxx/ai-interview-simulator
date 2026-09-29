// Precompiled once at module load, not on every call.
// Each rule has a weight because some words are fillers only some of the time.
//
// Note: Chrome's speech recognition usually returns text with no punctuation, so a strict
// "sentence start" rule would almost never match. That's why "like" and "actually" use lower
// weights (and "like" a small exclusion list) instead of depending on punctuation.
const FILLER_RULES = [
  // Nearly always a filler.
  { pattern: /\b(?:um+|uh+|uhm+|erm|er|hmm+)\b/g, weight: 1 },
  // Often a filler, but also legitimate ("do you know", "basically the same").
  { pattern: /\byou know\b/g, weight: 0.5 },
  { pattern: /\b(?:basically|actually)\b/g, weight: 0.5 },
  // "like" is legitimate after these ("I would like", "looks like", "feels like"...).
  {
    pattern:
      /(?<!\b(?:would|i'd|you'd|we'd|they'd|he'd|she'd|look|looks|looked|feel|feels|felt|seem|seems|sound|sounds|something|anything|nothing|much|such|unlike)\s)\blike\b/g,
    weight: 0.25,
  },
  // "so" only counts when it opens the answer or a sentence, where it's usually a stall word.
  { pattern: /(?:^|[.!?]\s+)so\b/g, weight: 0.5 },
]

// Returns a weighted filler count, rounded to a whole number.
export function countFillers(text) {
  if (!text) return 0
  const lower = text.toLowerCase()

  let total = 0
  for (const { pattern, weight } of FILLER_RULES) {
    const matches = lower.match(pattern)
    if (matches) total += matches.length * weight
  }
  return Math.round(total)
}