import { averageScores, entryOverall } from "../lib/scores"
import "./SessionReview.css"

const STAR_PARTS = [
  { key: "situation", letter: "S", label: "Situation" },
  { key: "task", letter: "T", label: "Task" },
  { key: "action", letter: "A", label: "Action" },
  { key: "result", letter: "R", label: "Result" },
]

// Score cards plus one review card per answer. Used by the summary screen and the history view.
//   retries      optional map of answer index -> retry result (summary screen only)
//   sessionMode  "practice" | "full", used to flag retries scored differently from the original
export default function SessionReview({ session, retries = {}, sessionMode }) {
  if (!session?.length) {
    return <p className="review-empty">No answers were recorded for this session.</p>
  }

  const avg = averageScores(session)

  return (
    <>
      <div className="score-row">
        <div className="score-card"><span>{avg.content}</span><label>Content</label></div>
        <div className="score-card"><span>{avg.clarity}</span><label>Clarity</label></div>
        <div className="score-card"><span>{avg.confidence}</span><label>Confidence</label></div>
      </div>

      {session.map((entry, i) => (
        <ReviewCard key={i} entry={entry} index={i} retry={retries[i]} sessionMode={sessionMode} />
      ))}
    </>
  )
}

// star: { situation, task, action, result } | null. Null means the question wasn't behavioral
// (or the session predates this feature), so nothing is shown.
function StarRow({ star }) {
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
}

function RetryComparison({ original, retry, sameMode }) {
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
          The retry was scored in a different mode than the original, so the numbers aren't directly comparable.
        </p>
      )}
      <p className="review-answer">{retry.answer}</p>
      <ul className="chip-row" aria-label="Scores for the retry">
        <li className="chip chip--score">Content <strong>{evaluation.contentScore}</strong></li>
        <li className="chip chip--score">Clarity <strong>{evaluation.clarityScore}</strong></li>
        <li className="chip chip--score">Confidence <strong>{evaluation.confidenceScore}</strong></li>
      </ul>
      <StarRow star={evaluation.star} />
      <p className="review-feedback">{evaluation.feedback}</p>
      <p className="review-tip">Tip: {evaluation.improvementTip}</p>
    </div>
  )
}

function ReviewCard({ entry, index, retry, sessionMode }) {
  const { evaluation, metrics = {}, inputMethod } = entry
  const typed = inputMethod === "text"

  return (
    <div className="review-card">
      <p className="review-index">
  Answer {index + 1}
  {entry.isFollowUp && <span className="follow-up-tag">Follow-up</span>}
</p>
      <p className="review-question">{entry.question}</p>
      <p className="review-answer">{entry.answer}</p>

      <ul className="chip-row" aria-label="Scores for this answer">
        <li className="chip chip--score">Content <strong>{evaluation.contentScore}</strong></li>
        <li className="chip chip--score">Clarity <strong>{evaluation.clarityScore}</strong></li>
        <li className="chip chip--score">Confidence <strong>{evaluation.confidenceScore}</strong></li>
      </ul>

      <ul className="chip-row" aria-label="Speech measurements for this answer">
        {typed ? (
          <li className="chip">Typed answer (no speech metrics)</li>
        ) : (
          <>
            <li className="chip">Pace <strong>{metrics.wpm ?? 0}</strong> wpm</li>
            <li className="chip">Fillers <strong>{metrics.fillerCount ?? 0}</strong></li>
            <li className="chip">Started after <strong>{metrics.responseDelaySec ?? 0}s</strong></li>
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
        <RetryComparison original={entry} retry={retry} sameMode={!sessionMode || retry.mode === sessionMode} />
      )}
    </div>
  )
}