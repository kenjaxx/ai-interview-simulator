import { useCallback, useEffect, useRef, useState } from "react"
import { loadHistoryPage, getCachedHistory, deleteSession } from "../lib/history"
import SessionReview from "./SessionReview"
import "./HistoryScreen.css"

const SERIES = [
  { key: "content", label: "Content", color: "#c084fc" },
  { key: "clarity", label: "Clarity", color: "#60a5fa" },
  { key: "confidence", label: "Confidence", color: "#34c777" },
]

const FILTERS = [
  { id: "all", label: "All" },
  { id: "full", label: "Full AI" },
  { id: "practice", label: "Practice" },
]

function formatDate(date) {
  if (!date) return "Just now"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function HistoryScreen({ uid, onBack }) {
  // If History was opened before, the sessions loaded then are shown instantly with no refetch.
  const [initial] = useState(() => getCachedHistory(uid))

  const [status, setStatus] = useState(initial ? "ready" : "loading") // "loading" | "ready" | "error"
  const [sessions, setSessions] = useState(initial?.sessions ?? [])
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [filter, setFilter] = useState("all")
  const [openId, setOpenId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applyEntry = useCallback((entry) => {
    setSessions(entry.sessions)
    setHasMore(entry.hasMore)
  }, [])

  // Loads page 1. refresh=true throws away the cache first.
  const loadFirstPage = useCallback(async (refresh = false) => {
    setStatus("loading")
    try {
      const entry = await loadHistoryPage(uid, { refresh })
      if (!mountedRef.current) return
      applyEntry(entry)
      setStatus("ready")
    } catch (err) {
      console.error("Couldn't load history:", err)
      if (mountedRef.current) setStatus("error")
    }
  }, [uid, applyEntry])

  useEffect(() => {
    if (!initial) loadFirstPage(false)
  }, [initial, loadFirstPage])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const entry = await loadHistoryPage(uid)
      if (mountedRef.current) applyEntry(entry)
    } catch (err) {
      console.error("Couldn't load more history:", err)
      if (mountedRef.current) setLoadMoreError(true)
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }

  const handleDelete = async (id) => {
    setDeleteError(null)
    try {
      await deleteSession(uid, id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setConfirmId(null)
      if (openId === id) setOpenId(null)
    } catch (err) {
      console.error("Couldn't delete session:", err)
      setDeleteError("Couldn't delete that session. Please try again.")
    }
  }

  // Filters and stats apply to the sessions loaded so far (a "+" shows when more exist).
  const visible = sessions.filter((s) => filter === "all" || s.mode === filter)
  const chronological = [...visible].reverse().slice(-20)
  const overallAverage = visible.length
    ? Math.round(visible.reduce((sum, s) => sum + s.averages.overall, 0) / visible.length)
    : 0
  const best = visible.length ? Math.max(...visible.map((s) => s.averages.overall)) : 0

  return (
    <div className="history-shell">
      <div className="history-head">
        <h1>Your progress</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "ready" && (
            <button className="secondary-btn" onClick={() => loadFirstPage(true)}>Refresh</button>
          )}
          <button className="secondary-btn" onClick={onBack}>← Back</button>
        </div>
      </div>

      {status === "loading" && (
        <div className="history-state" role="status">
          <div className="page-loading-spinner" />
          <p>Loading your sessions…</p>
        </div>
      )}

      {status === "error" && (
        <div className="error-panel" role="alert">
          <p>Couldn't load your history. Check your connection and try again.</p>
          <button className="secondary-btn" onClick={() => loadFirstPage(true)}>Retry</button>
        </div>
      )}

      {status === "ready" && sessions.length === 0 && (
        <div className="history-state">
          <p>No sessions yet. Finish an interview and it will show up here.</p>
          <button className="primary-btn" onClick={onBack}>Start practicing</button>
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
                <div className="score-card"><span>{visible.length}{hasMore ? "+" : ""}</span><label>Sessions</label></div>
                <div className="score-card"><span>{overallAverage}</span><label>Average</label></div>
                <div className="score-card"><span>{best}</span><label>Best</label></div>
              </div>

              <ProgressChart sessions={chronological} />

              {deleteError && <p className="history-error" role="alert">{deleteError}</p>}

              <ul className="history-list">
                {visible.map((s) => {
                  const open = openId === s.id
                  return (
                    <li className="history-item" key={s.id}>
                      <button
                        className="history-item-head"
                        onClick={() => setOpenId(open ? null : s.id)}
                        aria-expanded={open}
                      >
                        <span className="history-item-main">
                          <strong>{s.role}</strong>
                          <span>{s.seniority} · {formatDate(s.createdAt)}</span>
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
                            {confirmId === s.id ? (
                              <>
                                <span>Delete this session permanently?</span>
                                <button className="secondary-btn secondary-btn--danger" onClick={() => handleDelete(s.id)}>
                                  Yes, delete
                                </button>
                                <button className="secondary-btn" onClick={() => setConfirmId(null)}>Cancel</button>
                              </>
                            ) : (
                              <button className="secondary-btn" onClick={() => setConfirmId(s.id)}>Delete session</button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
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

function ProgressChart({ sessions }) {
  if (sessions.length < 2) {
    return <p className="history-empty">Finish at least two sessions to see your trend.</p>
  }

  const W = 600, H = 220, L = 34, R = 12, T = 12, B = 24
  const innerW = W - L - R
  const innerH = H - T - B
  const x = (i) => L + (i / (sessions.length - 1)) * innerW
  const y = (v) => T + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH

  return (
    <div className="chart-card">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart of content, clarity and confidence scores across your sessions, oldest to newest">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.08)" />
            <text x={L - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#9a9aa5">{tick}</text>
          </g>
        ))}
        {SERIES.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              points={sessions.map((e, i) => `${x(i)},${y(e.averages[s.key])}`).join(" ")}
            />
            {sessions.map((e, i) => (
              <circle key={i} cx={x(i)} cy={y(e.averages[s.key])} r="3" fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <ul className="chart-legend">
        {SERIES.map((s) => (
          <li key={s.key}><span className="legend-dot" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>
    </div>
  )
}