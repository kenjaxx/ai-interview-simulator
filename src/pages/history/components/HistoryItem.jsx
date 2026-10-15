import SessionReview from "../../../common/review/SessionReview"
import ExportPdfButton from "../../../common/review/ExportPdfButton"

function formatDate(date) {
  if (!date) return "Just now"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// One row in the history list: a header that expands to the full review, with export and delete.
//   s              the saved session (summary only; its answers come separately)
//   detail         { status: "loading" | "ready" | "error", session } for the answers
//   confirming     true while "Delete this session permanently?" is showing for this row
//   onRetryDetails fetch the answers again after an error
export default function HistoryItem({
  s,
  open,
  confirming,
  detail,
  onToggle,
  onRetryDetails,
  onAskDelete,
  onCancelDelete,
  onDelete,
}) {
  const answers = s.answerCount ? ` · ${s.answerCount} ${s.answerCount === 1 ? "answer" : "answers"}` : ""

  return (
    <li className="history-item">
      <button className="history-item-head" onClick={onToggle} aria-expanded={open}>
        <span className="history-item-main">
          <strong>{s.role}</strong>
          <span>
            {s.seniority} · {formatDate(s.createdAt)}
            {answers}
          </span>
        </span>
        <span className={`mode-badge ${s.mode === "full" ? "mode-badge--full" : ""}`}>
          {s.mode === "full" ? "Full AI" : "Practice"}
        </span>
        <span className="history-item-score" aria-label={`Average score ${s.averages.overall}`}>
          {s.averages.overall}
        </span>
      </button>

      {open && (
        <div className="history-item-body">
          {s.overallSummary && <p className="history-summary">{s.overallSummary}</p>}

          {detail.status === "loading" && (
            <p className="history-summary" role="status">
              Loading answers…
            </p>
          )}

          {detail.status === "error" && (
            <div className="error-panel" role="alert" style={{ margin: "0 0 1rem" }}>
              <p>Couldn't load the answers for this session.</p>
              <button className="secondary-btn" onClick={onRetryDetails}>
                Retry
              </button>
            </div>
          )}

          {detail.status === "ready" && <SessionReview session={detail.session} />}

          <div className="history-delete">
            {detail.status === "ready" && (
              <ExportPdfButton
                meta={{ role: s.role, seniority: s.seniority, mode: s.mode, date: s.createdAt }}
                overallSummary={s.overallSummary}
                session={detail.session}
              />
            )}
            {confirming ? (
              <>
                <span>Delete this session permanently?</span>
                <button className="secondary-btn secondary-btn--danger" onClick={onDelete}>
                  Yes, delete
                </button>
                <button className="secondary-btn" onClick={onCancelDelete}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="secondary-btn" onClick={onAskDelete}>
                Delete session
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}