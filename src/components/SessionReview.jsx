import { memo, useMemo } from "react"
import { averageScores } from "../lib/scores"
import { ScoreHelp } from "./ReviewParts"
import ReviewCard from "./ReviewCard"
import "./SessionReview.css"

// One shared empty object. A fresh `{}` default on every render would defeat React.memo.
const NO_RETRIES = {}

// Score cards plus one review card per answer. Used by the summary screen and the history view.
//   retries      optional map of answer index -> retry result (summary screen only)
//   sessionMode  "practice" | "full", used to flag retries scored differently from the original
//   showScores   false hides the three average cards (the summary screen shows score rings instead)
//
// Memoized: props are stable references (state from the interview hook or from the history cache),
// so typing, timers and quota updates elsewhere never re-render the review.
function SessionReview({ session, retries = NO_RETRIES, sessionMode, showScores = true }) {
  const avg = useMemo(() => averageScores(session), [session])

  if (!session?.length) {
    return <p className="review-empty">No answers were recorded for this session.</p>
  }

  return (
    <>
      <ScoreHelp />

      {showScores && (
        <div className="score-row">
          <div className="score-card">
            <span>{avg.content}</span>
            <p className="score-label">Content</p>
          </div>
          <div className="score-card">
            <span>{avg.clarity}</span>
            <p className="score-label">Clarity</p>
          </div>
          <div className="score-card">
            <span>{avg.confidence}</span>
            <p className="score-label">Confidence</p>
          </div>
        </div>
      )}

      {session.map((entry, i) => (
        <ReviewCard key={i} entry={entry} index={i} retry={retries[i]} sessionMode={sessionMode} />
      ))}
    </>
  )
}

export default memo(SessionReview)