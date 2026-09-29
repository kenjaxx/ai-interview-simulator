import { averageScores } from "../lib/scores"
import "./SessionReview.css"

// Score cards plus one review card per answer. Used by the summary screen and the history view.
export default function SessionReview({ session }) {
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
        <ReviewCard key={i} entry={entry} index={i} />
      ))}
    </>
  )
}

function ReviewCard({ entry, index }) {
  const { evaluation, metrics = {}, inputMethod } = entry
  const typed = inputMethod === "text"

  return (
    <div className="review-card">
      <p className="review-index">Answer {index + 1}</p>
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

      <p className="review-feedback">{evaluation.feedback}</p>
      <p className="review-tip">Tip: {evaluation.improvementTip}</p>
    </div>
  )
}