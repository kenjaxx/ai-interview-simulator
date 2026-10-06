// Averages per-question evaluations. Works for a live session and for one loaded from Firestore.
export function averageScores(session) {
  if (!session?.length) return { content: 0, clarity: 0, confidence: 0, overall: 0 }
  const avg = (key) => Math.round(session.reduce((sum, e) => sum + e.evaluation[key], 0) / session.length)
  const content = avg("contentScore")
  const clarity = avg("clarityScore")
  const confidence = avg("confidenceScore")
  return { content, clarity, confidence, overall: Math.round((content + clarity + confidence) / 3) }
}

// One overall number for a single answer (works for a session entry or a retry result).
export function entryOverall(entry) {
  const e = entry.evaluation
  return Math.round((e.contentScore + e.clarityScore + e.confidenceScore) / 3)
}

// Index of the lowest-scoring answer, ignoring any indexes in `skip`. Returns -1 if none qualify.
export function findWeakestIndex(session, skip = new Set()) {
  let weakest = -1
  let lowest = Infinity
  session.forEach((entry, i) => {
    if (skip.has(i)) return
    const score = entryOverall(entry)
    if (score < lowest) {
      lowest = score
      weakest = i
    }
  })
  return weakest
}