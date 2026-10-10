// Precompiled once at module load, not on every call.
// Each rule has a weight because some words are fillers only some of the time.
//
// Note: Chrome's speech recognition usually returns text with no punctuation, so a strict
// "sentence start" rule would almost never match. That's why most rules here avoid depending on
// punctuation and use low weights or a small exclusion list instead. "right?" only matches when
// a question mark is actually present (typed answers, or recognizers that add punctuation).
//
// Regex lookbehind is deliberately NOT used: older Safari (before 16.4) throws a SyntaxError for it
// when the module loads, which would crash the whole app. Rules that need "not preceded by X" use a
// `notAfter` set instead, checked by hand in findMatches().

// Words that make "kind of" / "sort of" a real noun phrase ("what kind of", "a sort of"...).
const KIND_SORT_EXCLUDED_AFTER = new Set([
  "a", "an", "the", "what", "which", "this", "that", "these", "those", "any", "some", "every",
  "each", "same", "another", "other", "different", "one", "no", "whatever", "all", "such",
  "certain", "particular", "special", "new", "what's", "whats",
])

// "like" is legitimate after these ("I would like", "looks like", "feels like"...).
const LIKE_EXCLUDED_AFTER = new Set([
  "would", "i'd", "you'd", "we'd", "they'd", "he'd", "she'd",
  "look", "looks", "looked", "feel", "feels", "felt", "seem", "seems",
  "sound", "sounds", "something", "anything", "nothing", "much", "such", "unlike",
])

const FILLER_RULES = [
  // Nearly always a filler.
  { pattern: /\b(?:um+|uh+|uhm+|erm|er|hmm+)\b/g, weight: 1 },
  // Often a filler, but also legitimate ("do you know", "basically the same").
  { pattern: /\byou know\b/g, weight: 0.5 },
  { pattern: /\b(?:basically|actually)\b/g, weight: 0.5 },
  // Hedges that stall or soften.
  { pattern: /\bi mean\b/g, weight: 0.5 },
  { pattern: /\b(?:kinda|sorta)\b/g, weight: 0.5 },
  { pattern: /\b(?:kind|sort) of\b/g, weight: 0.5, notAfter: KIND_SORT_EXCLUDED_AFTER },
  { pattern: /\bright\s*\?/g, weight: 0.5 },
  { pattern: /\b(?:or something|or whatever|and stuff)\b/g, weight: 0.25 },
  { pattern: /\bi guess\b/g, weight: 0.25 },
  { pattern: /\blike\b/g, weight: 0.25, notAfter: LIKE_EXCLUDED_AFTER },
  // "so" only counts when it opens the answer or a sentence, where it's usually a stall word.
  { pattern: /(?:^|[.!?]\s+)so\b/g, weight: 0.5 },
]

// The word right before position `index`, if it is separated from it by whitespace. Else "".
function wordBefore(lower, index) {
  const match = lower.slice(0, index).match(/([a-z0-9']+)\s$/)
  return match ? match[1] : ""
}

// All matches of one rule, minus the ones that follow an excluded word.
function findMatches(rule, lower) {
  const matches = []
  for (const match of lower.matchAll(rule.pattern)) {
    if (rule.notAfter && rule.notAfter.has(wordBefore(lower, match.index))) continue
    matches.push(match)
  }
  return matches
}

// Returns a weighted filler count, rounded to a whole number.
export function countFillers(text) {
  if (!text) return 0
  const lower = text.toLowerCase()

  let total = 0
  for (const rule of FILLER_RULES) {
    total += findMatches(rule, lower).length * rule.weight
  }
  return Math.round(total)
}

// Where the possible filler words are in the ORIGINAL text, as merged [start, end) ranges.
// Every rule counts here regardless of weight, so this can highlight a little more than the
// weighted count above suggests: it marks candidates, the count is the score.
export function findFillers(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  // A few Unicode characters change length when lowercased, which would shift every range.
  if (lower.length !== text.length) return []

  const ranges = []
  for (const rule of FILLER_RULES) {
    for (const match of findMatches(rule, lower)) {
      // The "so" rule also matches the punctuation and space before it. Don't highlight those.
      const lead = match[0].match(/^[.!?\s]*/)[0].length
      const start = match.index + lead
      const end = match.index + match[0].length
      if (end > start) ranges.push([start, end])
    }
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  return merged
}

// Splits text into [{ text, filler }] pieces, ready to render with the fillers marked.
export function splitByFillers(text) {
  const value = text || ""
  const ranges = findFillers(value)
  if (ranges.length === 0) return [{ text: value, filler: false }]

  const parts = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: value.slice(cursor, start), filler: false })
    parts.push({ text: value.slice(start, end), filler: true })
    cursor = end
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), filler: false })
  return parts
} 