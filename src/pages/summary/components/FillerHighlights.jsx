import { memo, useMemo, useState } from "react"
import { findFillers, splitByFillers } from "../../../lib/fillers"

const WINDOW = 260 // characters of the answer shown around the first filler

// Finds every possible filler in the session: totals per word, and the answers that have them.
function analyze(session) {
  const counts = new Map()
  const rows = []
  let total = 0

  session.forEach((entry, index) => {
    const text = entry.answer || ""
    const ranges = findFillers(text)
    if (ranges.length === 0) return
    total += ranges.length
    for (const [start, end] of ranges) {
      const word = text.slice(start, end).toLowerCase().replace(/\s+/g, " ").trim()
      counts.set(word, (counts.get(word) || 0) + 1)
    }
    rows.push({ index, text, ranges })
  })

  rows.sort((a, b) => b.ranges.length - a.ranges.length) // worst answer first
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  return { total, top, rows }
}

// A readable excerpt that starts shortly before the first filler, cut on word boundaries.
function excerpt(text, firstStart) {
  if (text.length <= WINDOW) return { text, before: false, after: false }

  let start = Math.max(0, firstStart - 80)
  if (start > 0) {
    const space = text.indexOf(" ", start)
    if (space !== -1) start = space + 1
  }
  let end = Math.min(text.length, start + WINDOW)
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end)
    if (space > start) end = space
  }
  return { text: text.slice(start, end), before: start > 0, after: end < text.length }
}

// Shows which filler words were used (as chips) and one answer with the fillers marked, so it is
// obvious what to cut. "Next answer" steps through the other answers that have fillers.
//   session  the finished session's entries
function FillerHighlights({ session }) {
  const { total, top, rows } = useMemo(() => analyze(session ?? []), [session])
  const [position, setPosition] = useState(0)

  if (!session?.length) return null

  if (total === 0) {
    return (
      <section className="filler-card filler-card--clean" aria-label="Filler words">
        <p className="filler-head">
          <span>Filler words</span>
          <span className="filler-pill filler-pill--ok">None spotted</span>
        </p>
        <p className="filler-note">Clean answers: no “um”, “uh” or “you know” stalling.</p>
      </section>
    )
  }

  const row = rows[Math.min(position, rows.length - 1)]
  const shown = excerpt(row.text, row.ranges[0][0])
  const parts = splitByFillers(shown.text)

  return (
    <section className="filler-card" aria-label="Filler words">
      <p className="filler-head">
        <span>Filler words</span>
        <span className="filler-pill">{total} spotted</span>
      </p>

      <ul className="filler-chips" aria-label="Most used filler words">
        {top.map(([word, count]) => (
          <li key={word} className="filler-chip">
            “{word}” <strong>× {count}</strong>
          </li>
        ))}
      </ul>

      <div className="filler-row">
        <span className="filler-answer">
          Answer {row.index + 1} · {row.ranges.length} in this answer
        </span>
        {rows.length > 1 && (
          <button type="button" className="link-btn" onClick={() => setPosition((p) => (p + 1) % rows.length)}>
            Next answer ({Math.min(position, rows.length - 1) + 1}/{rows.length})
          </button>
        )}
      </div>

      <p className="filler-snippet">
        {shown.before && "… "}
        {parts.map((p, i) =>
          p.filler ? (
            <mark key={i} className="filler-hit" title="Possible filler word">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
        {shown.after && " …"}
      </p>

      <p className="filler-note">Marked words may be fillers. Pause silently instead of filling the gap.</p>
    </section>
  )
}

export default memo(FillerHighlights)