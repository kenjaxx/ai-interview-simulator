import { memo, useMemo } from "react"
import { splitByFillers } from "../lib/fillers"

const STAR_PARTS = [
  { key: "situation", letter: "S", label: "Situation" },
  { key: "task", letter: "T", label: "Task" },
  { key: "action", letter: "A", label: "Action" },
  { key: "result", letter: "R", label: "Result" },
]

// A short "how is this scored?" explanation that covers both modes. Static, so it never re-renders.
export const ScoreHelp = memo(function ScoreHelp() {
  return (
    <details className="score-help">
      <summary>How is this scored?</summary>
      <ul>
        <li>
          <strong>Content</strong>: how relevant, deep and specific your answer is.
        </li>
        <li>
          <strong>Clarity</strong>: how well structured it is, plus your speaking pace for voice answers.
        </li>
        <li>
          <strong>Confidence</strong>: filler words, how soon you started talking, and how decisive your
          wording is.
        </li>
      </ul>
      <p>
        <strong>Full AI Mode</strong> sends your answers to Gemini, which reads each one against a rubric and
        writes the feedback, STAR check and sample answer.
      </p>
      <p>
        <strong>Practice Mode</strong> scores locally from simple signals: answer length, pace, filler words
        and delay. It judges delivery, not whether your answer is actually good.
      </p>
      <p>
        Treat scores as a guide. The same answer can score a few points differently from one run to the next.
      </p>
    </details>
  )
})

// Shows an answer with possible filler words marked, so you can see exactly what to cut.
// The regex work in splitByFillers only reruns when the text changes.
export const HighlightedAnswer = memo(function HighlightedAnswer({ text, showNote = false }) {
  const parts = useMemo(() => splitByFillers(text), [text])
  const hasFillers = useMemo(() => parts.some((p) => p.filler), [parts])

  return (
    <>
      <p className="review-answer">
        {parts.map((p, i) =>
          p.filler ? (
            <mark key={i} className="filler-mark" title="Possible filler word">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </p>
      {showNote && hasFillers && (
        <p className="filler-note">Highlighted words may be fillers. Try pausing silently instead.</p>
      )}
    </>
  )
})

// star: { situation, task, action, result } | null. Null means the question wasn't behavioral
// (or the session predates this feature), so nothing is shown.
export const StarRow = memo(function StarRow({ star }) {
  if (!star) return null
  const missing = STAR_PARTS.filter((p) => !star[p.key]).map((p) => p.label)

  return (
    <div className="star-block">
      <ul className="star-row" aria-label="STAR structure checklist">
        {STAR_PARTS.map((p) => (
          <li key={p.key} className={`star-pill ${star[p.key] ? "star-pill--yes" : "star-pill--no"}`}>
            <strong>{p.letter}</strong> {p.label} <span aria-hidden="true">{star[p.key] ? "✓" : "✗"}</span>
            <span className="sr-only">{star[p.key] ? " present" : " missing"}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && <p className="star-missing">Missing: {missing.join(", ")}</p>}
    </div>
  )
})