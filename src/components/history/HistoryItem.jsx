import SessionReview from "../SessionReview"
import ExportPdfButton from "../ExportPdfButton"

function formatDate(date) {
  if (!date) return "Just now"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// One row in the history list: a header that expands to the full review, with export and delete.
//   s           the saved session
//   confirming  true while "Delete this session permanently?" is showing for this row
export default function HistoryItem({ s, open, confirming, onToggle, onAskDelete, onCancelDelete, onDelete }) {
  return (
    <li className="history-item">
      <button className="history-item-head" onClick={onToggle} aria-expanded={open}>
        <span className="history-item-main">
          <strong>{s.role}</strong>
          <span>
            {s.seniority} · {formatDate(s.createdAt)}
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
          <SessionReview session={s.session} />
          <div className="history-delete">
            <ExportPdfButton
              meta={{ role: s.role, seniority: s.seniority, mode: s.mode, date: s.createdAt }}
              overallSummary={s.overallSummary}
              session={s.session}
            />
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