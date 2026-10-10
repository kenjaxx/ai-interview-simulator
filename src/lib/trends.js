// Pure helpers for the History screen, so the math can be tested without rendering anything.

export const SERIES = [
  { key: "content", label: "Content", color: "var(--s-content)" },
  { key: "clarity", label: "Clarity", color: "var(--s-clarity)" },
  { key: "confidence", label: "Confidence", color: "var(--s-confidence)" },
]

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

// Newest-first list in, oldest-first list out, capped to the most recent `max` sessions.
export function chronologicalSlice(sessions, max = 20) {
  return [...sessions].reverse().slice(-max)
}

// Average and best overall score across sessions (0 when there are none).
export function summarizeSessions(sessions) {
  if (!sessions.length) return { average: 0, best: 0 }
  const overall = sessions.map((s) => s.averages.overall)
  return {
    average: Math.round(mean(overall)),
    best: Math.max(...overall),
  }
}

// sessions: oldest first. Compares the most recent few sessions with the few before them.
// Returns null when there aren't enough sessions to compare.
export function computeTrends(sessions) {
  if (sessions.length < 2) return null

  const w = Math.min(3, Math.floor(sessions.length / 2))
  const rows = SERIES.map((s) => {
    const values = sessions.map((e) => e.averages[s.key])
    const recent = mean(values.slice(-w))
    const prior = mean(values.slice(-2 * w, -w))
    return { ...s, values, recent: Math.round(recent), delta: Math.round(recent - prior) }
  })
  const weakest = rows.reduce((a, b) => (b.recent < a.recent ? b : a))

  return { w, rows, weakest }
}
