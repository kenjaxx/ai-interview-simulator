import { entryOverall } from "../lib/scores"

// Offers to re-answer the lowest-scoring answer that hasn't been retried yet.
export default function RetryCard({ session, weakestIndex, usesAi, onRetry }) {
  if (weakestIndex < 0 || !session[weakestIndex]) return null
  const entry = session[weakestIndex]

  return (
    <div className="retry-card">
      <div>
        <p className="retry-title">Retry your weakest answer</p>
        <p className="retry-sub">
          Answer {weakestIndex + 1} scored {entryOverall(entry)}: “{entry.question}”{" "}
          {usesAi
            ? "Re-answering uses 1 AI evaluation."
            : "It will be scored locally in Practice Mode."}
        </p>
      </div>
      <button className="primary-btn" onClick={() => onRetry(weakestIndex)}>Re-answer it</button>
    </div>
  )
}