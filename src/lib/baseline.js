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

// Same result, but from the rolling stats document, so no sessions have to be read.
//   stats    { full: bucket, practice: bucket } from src/lib/stats.js
//   exclude  averages of a session that is already counted in the stats (the one that was just
//            saved), or null. It is taken out so a session is never compared with itself.
export function baselineFromStats(stats, mode, exclude = null) {
  const bucket = stats?.[mode]
  if (!bucket || bucket.count <= 0) return null

  const count = bucket.count - (exclude ? 1 : 0)
  if (count <= 0) return null

  const avg = (key) => Math.round((bucket[key] - (exclude ? exclude[key] : 0)) / count)
  return {
    count,
    content: avg("content"),
    clarity: avg("clarity"),
    confidence: avg("confidence"),
    overall: avg("overall"),
  }
}