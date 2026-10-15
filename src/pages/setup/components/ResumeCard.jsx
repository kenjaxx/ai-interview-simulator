// Offered on the setup screen when an interview was interrupted by a refresh.
//   draft  { role, seniority, answered, total, finished } or null
export default function ResumeCard({ draft, onResume, onDiscard, disabled = false }) {
  if (!draft) return null

  const detail = draft.finished
    ? "All your answers were recorded and were waiting to be scored."
    : `${draft.answered} ${draft.answered === 1 ? "answer" : "answers"} recorded so far, ${draft.total} questions in total.`

  return (
    <div className="retry-card" role="region" aria-label="Unfinished interview">
      <div>
        <p className="retry-title">Pick up where you left off?</p>
        <p className="retry-sub">
          Your {draft.seniority} {draft.role} interview was interrupted. {detail}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button type="button" className="primary-btn" onClick={onResume} disabled={disabled}>
          {draft.finished ? "Score it" : "Resume"}
        </button>
        <button type="button" className="secondary-btn" onClick={onDiscard} disabled={disabled}>
          Discard
        </button>
      </div>
    </div>
  )
}