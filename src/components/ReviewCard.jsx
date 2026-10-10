import { memo } from "react"
import { entryOverall } from "../lib/scores"
import { HighlightedAnswer, StarRow } from "./ReviewParts"

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

// One answer: the question, the answer with fillers marked, scores, speech metrics, STAR check,
// feedback, a sample answer, and the retry comparison if there is one.
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
}

export default memo(ReviewCard)