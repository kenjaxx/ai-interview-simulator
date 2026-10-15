// Rolling per-mode totals, kept in users/{uid}/stats/summary. Pure helpers, so the math can be tested
// without Firestore. Sums are sums of each session's own rounded averages, so
// round(sum / count) equals the average of the sessions' averages.

export const MODES = ["full", "practice"]
const KEYS = ["content", "clarity", "confidence", "overall"]

const emptyBucket = () => ({ count: 0, content: 0, clarity: 0, confidence: 0, overall: 0, best: 0 })

export const emptyStats = () => ({ full: emptyBucket(), practice: emptyBucket() })

const num = (v, max = Infinity) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0)

function normalizeBucket(raw) {
  if (!raw || typeof raw !== "object") return emptyBucket()
  const count = num(raw.count)
  const bucket = { count, best: num(raw.best, 100) }
  for (const key of KEYS) bucket[key] = num(raw[key], 100 * count)
  return bucket
}

// Accepts whatever came out of Firestore (or nothing) and returns a clean { full, practice }.
export function normalizeStats(raw) {
  return { full: normalizeBucket(raw?.full), practice: normalizeBucket(raw?.practice) }
}

// averages: { content, clarity, confidence, overall } of one session.
export function addToStats(stats, mode, averages) {
  if (!MODES.includes(mode) || !averages) return stats
  const bucket = stats[mode]
  const next = { count: bucket.count + 1, best: Math.max(bucket.best, averages.overall) }
  for (const key of KEYS) next[key] = bucket[key] + averages[key]
  return { ...stats, [mode]: next }
}

// Returns { stats, bestStale }. bestStale is true when the removed session may have been the
// best one, so the caller has to look the real best up again.
export function removeFromStats(stats, mode, averages) {
  if (!MODES.includes(mode) || !averages) return { stats, bestStale: false }
  const bucket = stats[mode]
  if (bucket.count <= 1) return { stats: { ...stats, [mode]: emptyBucket() }, bestStale: false }

  const next = { count: bucket.count - 1, best: bucket.best }
  for (const key of KEYS) next[key] = Math.max(0, bucket[key] - averages[key])
  return { stats: { ...stats, [mode]: next }, bestStale: averages.overall >= bucket.best }
}

// sessions: [{ mode, averages }]. Used once, to backfill users who saved sessions before stats existed.
export function computeStatsFromSessions(sessions) {
  return sessions.reduce((stats, s) => addToStats(stats, s.mode, s.averages), emptyStats())
}

// filter: "all" | "full" | "practice"  ->  { count, average, best }
export function summarizeStats(stats, filter = "all") {
  const buckets = filter === "all" ? MODES.map((m) => stats[m]) : [stats[filter] ?? emptyBucket()]
  const count = buckets.reduce((sum, b) => sum + b.count, 0)
  const overall = buckets.reduce((sum, b) => sum + b.overall, 0)
  return {
    count,
    average: count ? Math.round(overall / count) : 0,
    best: buckets.reduce((max, b) => Math.max(max, b.best), 0),
  }
}