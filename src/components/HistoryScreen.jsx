import { useMemo, useState } from "react"
import { useHistory } from "../hooks/useHistory"
import { useToast } from "../context/ToastContext"
import { chronologicalSlice, summarizeSessions } from "../lib/trends"
import HistoryItem from "./history/HistoryItem"
import HistorySkeleton from "./history/HistorySkeleton"
import TrendCards from "./TrendCards"
import ProgressChart from "./ProgressChart"
import "./HistoryScreen.css"

const FILTERS = [
  { id: "all", label: "All" },
  { id: "full", label: "Full AI" },
  { id: "practice", label: "Practice" },
]

export default function HistoryScreen({ uid, onBack }) {
  const {
    status,
    sessions,
    hasMore,
    loadingMore,
    loadMoreError,
    deleteError,
    loadFirstPage,
    loadMore,
    remove,
  } = useHistory(uid)
  const toast = useToast()

  const [filter, setFilter] = useState("all")
  const [openId, setOpenId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const handleDelete = async (id) => {
    const deleted = await remove(id)
    if (!deleted) {
      toast.error("Couldn't delete that session. Please try again.")
      return
    }
    toast.success("Session deleted.")
    setConfirmId(null)
    if (openId === id) setOpenId(null)
  }

  // Filters and stats apply to the sessions loaded so far (a "+" shows when more exist).
  // Memoized so expanding a row or confirming a delete doesn't rebuild the arrays, which would
  // otherwise force the chart and trend cards to redraw on every click.
  const visible = useMemo(
    () => sessions.filter((s) => filter === "all" || s.mode === filter),
    [sessions, filter]
  )
  const chronological = useMemo(() => chronologicalSlice(visible), [visible])
  const { average, best } = useMemo(() => summarizeSessions(visible), [visible])

  return (
    <div className="history-shell">
      <div className="history-head">
        <h1>Your progress</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "ready" && (
            <button className="secondary-btn" onClick={() => loadFirstPage(true)}>
              Refresh
            </button>
          )}
          <button className="secondary-btn" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>

      {status === "loading" && <HistorySkeleton />}

      {status === "error" && (
        <div className="error-panel" role="alert">
          <p>Couldn't load your history. Check your connection and try again.</p>
          <button className="secondary-btn" onClick={() => loadFirstPage(true)}>
            Retry
          </button>
        </div>
      )}

      {status === "ready" && sessions.length === 0 && (
        <div className="history-state">
          <p>No sessions yet. Finish an interview and it will show up here.</p>
          <button className="primary-btn" onClick={onBack}>
            Start practicing
          </button>
        </div>
      )}

      {status === "ready" && sessions.length > 0 && (
        <>
          <div className="history-filters" role="group" aria-label="Filter by mode">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-btn ${filter === f.id ? "filter-btn--on" : ""}`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="history-empty">
              No sessions in this mode{hasMore ? " among the ones loaded so far" : " yet"}.
            </p>
          ) : (
            <>
              <div className="score-row">
                <div className="score-card">
                  <span>
                    {visible.length}
                    {hasMore ? "+" : ""}
                  </span>
                  <label>Sessions</label>
                </div>
                <div className="score-card">
                  <span>{average}</span>
                  <label>Average</label>
                </div>
                <div className="score-card">
                  <span>{best}</span>
                  <label>Best</label>
                </div>
              </div>

              <TrendCards sessions={chronological} />
              <ProgressChart sessions={chronological} />

              {deleteError && (
                <p className="history-error" role="alert">
                  {deleteError}
                </p>
              )}

              <ul className="history-list">
                {visible.map((s) => (
                  <HistoryItem
                    key={s.id}
                    s={s}
                    open={openId === s.id}
                    confirming={confirmId === s.id}
                    onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                    onAskDelete={() => setConfirmId(s.id)}
                    onCancelDelete={() => setConfirmId(null)}
                    onDelete={() => handleDelete(s.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {loadMoreError && (
            <p className="history-error" role="alert" style={{ marginTop: "1rem" }}>
              Couldn't load more sessions. Please try again.
            </p>
          )}

          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1.25rem" }}>
              <button className="secondary-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}