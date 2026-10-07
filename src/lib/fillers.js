// Precompiled once at module load, not on every call.
// Each rule has a weight because some words are fillers only some of the time.
//
// Note: Chrome's speech recognition usually returns text with no punctuation, so a strict
// "sentence start" rule would almost never match. That's why most rules here avoid depending on
// punctuation and use low weights or a small exclusion list instead. "right?" only matches when
// a question mark is actually present (typed answers, or recognizers that add punctuation).

// Words that make "kind of" / "sort of" a real noun phrase ("what kind of", "a sort of"...).
const KIND_SORT_EXCLUDED_AFTER =
  "a|an|the|what|which|this|that|these|those|any|some|every|each|same|another|other|different|one|no|whatever|all|such|certain|particular|special|new|what's|whats"

const FILLER_RULES = [
  // Nearly always a filler.
  { pattern: /\b(?:um+|uh+|uhm+|erm|er|hmm+)\b/g, weight: 1 },
  // Often a filler, but also legitimate ("do you know", "basically the same").
  { pattern: /\byou know\b/g, weight: 0.5 },
  { pattern: /\b(?:basically|actually)\b/g, weight: 0.5 },
  // Hedges that stall or soften.
  { pattern: /\bi mean\b/g, weight: 0.5 },
  { pattern: /\b(?:kinda|sorta)\b/g, weight: 0.5 },
  {
    pattern: new RegExp(`(?<!\\b(?:${KIND_SORT_EXCLUDED_AFTER})\\s)\\b(?:kind|sort) of\\b`, "g"),
    weight: 0.5,
  },
  { pattern: /\bright\s*\?/g, weight: 0.5 },
  { pattern: /\b(?:or something|or whatever|and stuff)\b/g, weight: 0.25 },
  { pattern: /\bi guess\b/g, weight: 0.25 },
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