// Averages per-question evaluations. Works for a live session and for one loaded from Firestore.
export function averageScores(session) {
  if (!session?.length) return { content: 0, clarity: 0, confidence: 0, overall: 0 }
  const avg = (key) => Math.round(session.reduce((sum, e) => sum + e.evaluation[key], 0) / session.length)
  const content = avg("contentScore")
  const clarity = avg("clarityScore")
  const confidence = avg("confidenceScore")
  return { content, clarity, confidence, overall: Math.round((content + clarity + confidence) / 3) }
}