import { useMemo, useState } from "react"
import { useHistory } from "../hooks/useHistory"
import { useToast } from "../context/ToastContext"
import { chronologicalSlice, summarizeSessions } from "../lib/trends"
import { summarizeStats } from "../lib/stats"
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
    stats,
    details,
    loadingMore,
    loadMoreError,
    deleteError,
    loadFirstPage,
    loadMore,
    loadDetails,
    remove,
  } = useHistory(uid)
  const toast = useToast()

  const [filter, setFilter] = useState("all")
  const [roleFilter, setRoleFilter] = useState("all")
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

  // Opening a row fetches its answers (one document). Sessions saved before the split already have them.
  const toggle = (s) => {
    const opening = openId !== s.id
    setOpenId(opening ? s.id : null)
    const state = details[s.id]?.status
    if (opening && !s.session && state !== "ready" && state !== "loading") loadDetails(s.id)
  }

  const detailFor = (s) => (s.session ? { status: "ready", session: s.session } : (details[s.id] ?? { status: "loading" }))

  // Every role that appears in the sessions loaded so far.
  const roles = useMemo(() => [...new Set(sessions.map((s) => s.role).filter(Boolean))].sort(), [sessions])
  // If the chosen role no longer exists (its last session was deleted), fall back to "all".
  const activeRole = roles.includes(roleFilter) ? roleFilter : "all"

  // The list, chart and trends use the sessions loaded so far. Memoized so expanding a row or
  // confirming a delete doesn't rebuild the arrays, which would force the chart to redraw.
  const visible = useMemo(
    () =>
      sessions.filter(
        (s) => (filter === "all" || s.mode === filter) && (activeRole === "all" || s.role === activeRole)
      ),
    [sessions, filter, activeRole]
  )
  const chronological = useMemo(() => chronologicalSlice(visible), [visible])
  const loadedSummary = useMemo(() => summarizeSessions(visible), [visible])

  // The three stat cards are exact (from the rolling stats over ALL sessions) whenever they can be.
  // Totals per role aren't stored, so with a role filter they cover the loaded sessions only.
  const exact = !!stats && activeRole === "all"
  const totals = useMemo(() => (exact ? summarizeStats(stats, filter) : null), [exact, stats, filter])
  const countText = exact ? String(totals.count) : `${visible.length}${hasMore ? "+" : ""}`
  const average = exact ? totals.average : loadedSummary.average
  const best = exact ? totals.best : loadedSummary.best

  const clearFilters = () => {
    setFilter("all")
    setRoleFilter("all")
  }

  return (
    <div className="history-shell">
      <div className="history-head">
        {/* The page's only <h1>. ScreenFocus moves focus here when the screen opens. */}
        <h1 tabIndex={-1} data-screen-heading>
          Your progress
        </h1>
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
          <div className="history-filters">
            <div className="history-filter-group" role="group" aria-label="Filter by mode">
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

            {roles.length > 1 && (
              <div className="history-role">
                <label htmlFor="history-role" className="sr-only">
                  Filter by role
                </label>
                <select
                  id="history-role"
                  className="history-role-select"
                  value={activeRole}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">All roles</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="history-empty">
              No sessions match these filters{hasMore ? " among the ones loaded so far" : ""}.{" "}
              <button type="button" className="link-btn" onClick={clearFilters}>
                Clear filters
              </button>
            </p>
          ) : (
            <>
              <div className="score-row">
                <div className="score-card">
                  <span>{countText}</span>
                  <p className="score-label">Sessions</p>
                </div>
                <div className="score-card">
                  <span>{average}</span>
                  <p className="score-label">Average</p>
                </div>
                <div className="score-card">
                  <span>{best}</span>
                  <p className="score-label">Best</p>
                </div>
              </div>

              {!exact && hasMore && (
                <p className="trend-note" style={{ marginTop: "-1rem" }}>
                  {activeRole !== "all"
                    ? "These totals cover the sessions loaded so far for this role. Load more to include older ones."
                    : "Totals are based on the sessions loaded so far."}
                </p>
              )}

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
                    detail={detailFor(s)}
                    onToggle={() => toggle(s)}
                    onRetryDetails={() => loadDetails(s.id)}
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