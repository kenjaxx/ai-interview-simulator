// Average scores across earlier sessions, used for the "vs your average" comparison on the summary.
// sessions: saved sessions (each with `mode` and `averages`). Only sessions in the same mode count,
// because Practice Mode (local heuristics) and Full AI Mode (a model's judgement) aren't comparable.
// Returns null when there is nothing to compare against.
export function computeBaseline(sessions, mode) {
  const same = (sessions || []).filter((s) => s?.mode === mode && s.averages)
  if (same.length === 0) return null

  const avg = (key) => Math.round(same.reduce((sum, s) => sum + s.averages[key], 0) / same.length)
  return {
    count: same.length,
    content: avg("content"),
    clarity: avg("clarity"),
    confidence: avg("confidence"),
    overall: avg("overall"),
  }
}