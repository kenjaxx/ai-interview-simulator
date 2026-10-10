import { memo, useMemo } from "react"
import { averageScores, entryOverall } from "../lib/scores"
import { splitByFillers } from "../lib/fillers"
import "./SessionReview.css"

const STAR_PARTS = [
  { key: "situation", letter: "S", label: "Situation" },
  { key: "task", letter: "T", label: "Task" },
  { key: "action", letter: "A", label: "Action" },
  { key: "result", letter: "R", label: "Result" },
]

// One shared empty object. A fresh `{}` default on every render would defeat React.memo.
const NO_RETRIES = {}

// Score cards plus one review card per answer. Used by the summary screen and the history view.
//   retries      optional map of answer index -> retry result (summary screen only)
//   sessionMode  "practice" | "full", used to flag retries scored differently from the original
//
// Everything here is memoized: props are stable references (state from the interview hook or from
// the history cache), so typing, timers and quota updates elsewhere never re-render the review.
function SessionReview({ session, retries = NO_RETRIES, sessionMode }) {
  const avg = useMemo(() => averageScores(session), [session])

  if (!session?.length) {
    return <p className="review-empty">No answers were recorded for this session.</p>
  }

  return (
    <>
      <ScoreHelp />

      <div className="score-row">
        <div className="score-card">
          <span>{avg.content}</span>
          <label>Content</label>
        </div>
        <div className="score-card">
          <span>{avg.clarity}</span>
          <label>Clarity</label>
        </div>
        <div className="score-card">
          <span>{avg.confidence}</span>
          <label>Confidence</label>
        </div>
      </div>

      {session.map((entry, i) => (
        <ReviewCard key={i} entry={entry} index={i} retry={retries[i]} sessionMode={sessionMode} />
      ))}
    </>
  )
}

export default memo(SessionReview)

// A short "how is this scored?" explanation that covers both modes. Static, so it never re-renders.
const ScoreHelp = memo(function ScoreHelp() {
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
const HighlightedAnswer = memo(function HighlightedAnswer({ text, showNote = false }) {
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
const StarRow = memo(function StarRow({ star }) {
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

const RetryComparison = memo(function RetryComparison({ original, retry, sameMode }) {
  const before = entryOverall(original)
  const after = entryOverall(retry)
  const delta = after - before
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "same"
  const { evaluation } = retry

  return (
    <div className="retry-compare">
      <p className="retry-compare-head">
        Your retry: <strong>{before}</strong> → <strong>{after}</strong>{" "}
        <span className={`retry-delta retry-delta--${tone}`}>
          {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "no change"}
        </span>
      </p>
      {!sameMode && (
        <p className="retry-compare-note">
          The retry was scored in a different mode than the original, so the numbers aren't directly
          comparable.
        </p>
      )}
      <HighlightedAnswer text={retry.answer} />
      <ul className="chip-row" aria-label="Scores for the retry">
        <li className="chip chip--score">
          Content <strong>{evaluation.contentScore}</strong>
        </li>
        <li className="chip chip--score">
          Clarity <strong>{evaluation.clarityScore}</strong>
        </li>
        <li className="chip chip--score">
          Confidence <strong>{evaluation.confidenceScore}</strong>
        </li>
      </ul>
      <StarRow star={evaluation.star} />
      <p className="review-feedback">{evaluation.feedback}</p>
      <p className="review-tip">Tip: {evaluation.improvementTip}</p>
    </div>
  )
})

const ReviewCard = memo(function ReviewCard({ entry, index, retry, sessionMode }) {
  const { evaluation, metrics = {}, inputMethod } = entry
  const typed = inputMethod === "text"

  return (
    <div className="review-card">
      <p className="review-index">
        Answer {index + 1}
        {entry.isFollowUp && <span className="follow-up-tag">Follow-up</span>}
      </p>
      <p className="review-question">{entry.question}</p>
      <HighlightedAnswer text={entry.answer} showNote />

      <ul className="chip-row" aria-label="Scores for this answer">
        <li className="chip chip--score">
          Content <strong>{evaluation.contentScore}</strong>
        </li>
        <li className="chip chip--score">
          Clarity <strong>{evaluation.clarityScore}</strong>
        </li>
        <li className="chip chip--score">
          Confidence <strong>{evaluation.confidenceScore}</strong>
        </li>
      </ul>

      <ul className="chip-row" aria-label="Speech measurements for this answer">
        {typed ? (
          <li className="chip">Typed answer (no speech metrics)</li>
        ) : (
          <>
            <li className="chip">
              Pace <strong>{metrics.wpm ?? 0}</strong> wpm
            </li>
            <li className="chip">
              Fillers <strong>{metrics.fillerCount ?? 0}</strong>
            </li>
            <li className="chip">
              Started after <strong>{metrics.responseDelaySec ?? 0}s</strong>
            </li>
          </>
        )}
      </ul>

      <StarRow star={evaluation.star} />

      <p className="review-feedback">{evaluation.feedback}</p>
      <p className="review-tip">Tip: {evaluation.improvementTip}</p>

      {evaluation.strongAnswer && (
        <details className="strong-answer">
          <summary>See a sample strong answer</summary>
          <p>{evaluation.strongAnswer}</p>
        </details>
      )}

      {retry && (
        <RetryComparison
          original={entry}
          retry={retry}
          sameMode={!sessionMode || retry.mode === sessionMode}
        />
      )}
    </div>
  )
})