import Header from "../components/Header"
import SessionReview from "../components/SessionReview"
import RetryCard from "../components/RetryCard"
import ExportPdfButton from "../components/ExportPdfButton"
import ScoreSummary from "../components/summary/ScoreSummary"
import { useHistoryBaseline } from "../hooks/useHistoryBaseline"
import { useSaveToasts } from "../hooks/useSaveToasts"
import { resetPhrase } from "../lib/time"

// summary: the `summary` object from useInterview().
export default function SummaryScreen({ summary, onHistory }) {
  // Toasts for save results, and the user's earlier average for the "vs your average" comparison.
  useSaveToasts(summary.saveStatus)
  const baseline = useHistoryBaseline({
    uid: summary.uid,
    saveStatus: summary.saveStatus,
    mode: summary.sessionMode,
  })

  return (
    <div className="page">
      <Header onHistory={onHistory} />
      <div className="summary-shell">
        <div className="summary-heading-row">
          <h1 tabIndex={-1} data-screen-heading>
            Session summary
          </h1>
          <span className={`mode-badge ${summary.sessionMode === "full" ? "mode-badge--full" : ""}`}>
            {summary.sessionMode === "full" ? "Full AI Mode" : "Practice Mode"}
          </span>
        </div>

        {summary.overallSummary && (
          <p className="hero-sub" style={{ margin: "0 0 1.75rem", textAlign: "left" }}>
            {summary.overallSummary}
          </p>
        )}

        <ScoreSummary session={summary.session} baseline={baseline} sessionMode={summary.sessionMode} />

        {summary.sessionMode === "full" && summary.usage && (
          <p className="usage-note" role="status">
            {summary.usage.remaining === 0
              ? `That was your last AI evaluation for today (${summary.usage.limit} per day). They reset ${resetPhrase()}. Practice Mode is still unlimited.`
              : `${summary.usage.remaining} of ${summary.usage.limit} AI evaluations left today. They reset ${resetPhrase()}.`}
          </p>
        )}

        <RetryCard
          session={summary.session}
          weakestIndex={summary.weakestIndex}
          usesAi={summary.retryUsesAi}
          onRetry={summary.startRetry}
        />

        <SessionReview
          session={summary.session}
          retries={summary.retryResults}
          sessionMode={summary.sessionMode}
          showScores={false}
        />

        <div className="save-status" role="status">
          {summary.saveStatus === "saving" && <span>Saving to your history…</span>}
          {summary.saveStatus === "saved" && <span>Saved to your history.</span>}
          {summary.saveStatus === "skipped" && (
            <span>
              Private session: this one wasn't saved to your history. Export it as a PDF if you want to keep
              it.
            </span>
          )}
          {summary.saveStatus === "error" && (
            <>
              <span>Couldn't save this session to your history.</span>
              <button className="secondary-btn" onClick={summary.retrySave}>
                Retry save
              </button>
            </>
          )}
        </div>

        <div className="summary-actions">
          <button className="primary-btn" onClick={summary.restart}>
            Practice again
          </button>
          <button className="secondary-btn" onClick={onHistory}>
            View history
          </button>
          <ExportPdfButton
            meta={summary.meta}
            overallSummary={summary.overallSummary}
            session={summary.session}
            retries={summary.retryResults}
          />
        </div>
      </div>
    </div>
  )
}