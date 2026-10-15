import { useState } from "react"
import Header from "../../common/components/Header"
import SessionReview from "../../common/review/SessionReview"
import ExportPdfButton from "../../common/review/ExportPdfButton"
import RetryCard from "./components/RetryCard"
import ScoreSummary from "./components/ScoreSummary"
import StrengthsFocus from "./components/StrengthsFocus"
import FillerHighlights from "./components/FillerHighlights"
import { useHistoryBaseline } from "./hooks/useHistoryBaseline"
import { useSaveToasts } from "./hooks/useSaveToasts"
import { resetPhrase } from "../../lib/time"
import "./summary.fit.css"
import "./summary-extras.css"

const TABS = ["overview", "answers"]

// summary: the `summary` object from useInterview().
// One screen, no page scroll: "Overview" (scores, strengths, fillers, retry) and "Answers" (the review
// cards) are two tabs, and the action buttons are pinned at the bottom. Both panels stay mounted (just
// hidden), so the open/closed state of the review cards survives switching tabs.
export default function SummaryScreen({ summary, onHistory }) {
  const [tab, setTab] = useState("overview")

  // Toasts for save results, and the user's earlier average for the "vs your average" comparison.
  useSaveToasts(summary.saveStatus)
  const baseline = useHistoryBaseline({
    uid: summary.uid,
    saveStatus: summary.saveStatus,
    mode: summary.sessionMode,
    session: summary.session,
  })

  const answerCount = summary.session?.length ?? 0

  // Left/Right arrows move between the two tabs.
  const onTabKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length]
    setTab(next)
    document.getElementById(`summary-tab-${next}`)?.focus()
  }

  return (
    <div className="page page--summary">
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

        <div className="summary-tabs" role="tablist" aria-label="Summary sections" onKeyDown={onTabKeyDown}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              id={`summary-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`summary-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={`summary-tab ${tab === id ? "summary-tab--on" : ""}`}
              onClick={() => setTab(id)}
            >
              {id === "overview" ? "Overview" : `Answers (${answerCount})`}
            </button>
          ))}
        </div>

        <div
          id="summary-panel-overview"
          role="tabpanel"
          aria-labelledby="summary-tab-overview"
          className="summary-panel summary-panel--overview"
          hidden={tab !== "overview"}
        >
          {summary.overallSummary && <p className="summary-lede">{summary.overallSummary}</p>}

          <ScoreSummary session={summary.session} baseline={baseline} sessionMode={summary.sessionMode} />

          <StrengthsFocus session={summary.session} />

          <FillerHighlights session={summary.session} />

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
        </div>

        <div
          id="summary-panel-answers"
          role="tabpanel"
          aria-labelledby="summary-tab-answers"
          className="summary-panel"
          hidden={tab !== "answers"}
        >
          <SessionReview
            session={summary.session}
            retries={summary.retryResults}
            sessionMode={summary.sessionMode}
            showScores={false}
            collapsible
          />
        </div>

        <div className="summary-footer">
          <div className="save-status" role="status">
            {summary.saveStatus === "saving" && <span>Saving to your history…</span>}
            {summary.saveStatus === "saved" && <span>Saved to your history.</span>}
            {summary.saveStatus === "skipped" && (
              <span>Private session: not saved to your history. Export a PDF to keep it.</span>
            )}
            {summary.saveStatus === "error" && (
              <>
                <span>Couldn't save this session.</span>
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
    </div>
  )
}