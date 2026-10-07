import { useCallback, useEffect, useRef, useState } from "react"
import { loadHistoryPage, getCachedHistory, deleteSession } from "../lib/history"
import SessionReview from "./SessionReview"
import ExportPdfButton from "./ExportPdfButton"
import "./HistoryScreen.css"

const SERIES = [
  { key: "content", label: "Content", color: "var(--s-content)" },
  { key: "clarity", label: "Clarity", color: "var(--s-clarity)" },
  { key: "confidence", label: "Confidence", color: "var(--s-confidence)" },
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

              <TrendCards sessions={chronological} />
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
                            <ExportPdfButton
                              meta={{ role: s.role, seniority: s.seniority, mode: s.mode, date: s.createdAt }}
                              overallSummary={s.overallSummary}
                              session={s.session}
                            />
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

// ---------- per-category trends ----------

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

function Sparkline({ values, color }) {
  const W = 84, H = 26, P = 2
  const pts = values
    .map((v, i) => {
      const x = P + (i / (values.length - 1)) * (W - 2 * P)
      const y = P + (H - 2 * P) - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P)
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} style={{ stroke: color }} />
    </svg>
  )
}

// sessions: oldest first. Compares the most recent few sessions with the few before them.
function TrendCards({ sessions }) {
  if (sessions.length < 2) return null

  const w = Math.min(3, Math.floor(sessions.length / 2))
  const rows = SERIES.map((s) => {
    const values = sessions.map((e) => e.averages[s.key])
    const recent = mean(values.slice(-w))
    const prior = mean(values.slice(-2 * w, -w))
    return { ...s, values, recent: Math.round(recent), delta: Math.round(recent - prior) }
  })
  const weakest = rows.reduce((a, b) => (b.recent < a.recent ? b : a))

  return (
    <>
      <div className="trend-row">
        {rows.map((r) => {
          const tone = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "same"
          return (
            <div className="trend-card" key={r.key}>
              <p className="trend-label">{r.label}</p>
              <p className="trend-value">{r.recent}</p>
              <p className={`trend-delta trend-delta--${tone}`}>
                {r.delta > 0 ? `▲ +${r.delta}` : r.delta < 0 ? `▼ ${r.delta}` : "– no change"}
              </p>
              <Sparkline values={r.values} color={r.color} />
            </div>
          )
        })}
      </div>
      <p className="trend-note">
        Weakest area lately: <strong>{weakest.label}</strong> ({weakest.recent}). Each card compares your last{" "}
        {w} session{w > 1 ? "s" : ""} with the {w} before.
      </p>
    </>
  )
}

function ProgressChart({ sessions }) {
  const [hidden, setHidden] = useState(() => new Set())

  if (sessions.length < 2) {
    return <p className="history-empty">Finish at least two sessions to see your trend.</p>
  }

  const toggle = (key) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (SERIES.length - prev.size > 1) next.add(key) // always keep one line visible
      return next
    })
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
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--line)" }} />
            <text x={L - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--t-muted)" }}>{tick}</text>
          </g>
        ))}
        {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              strokeWidth="2"
              style={{ stroke: s.color }}
              points={sessions.map((e, i) => `${x(i)},${y(e.averages[s.key])}`).join(" ")}
            />
            {sessions.map((e, i) => (
              <circle key={i} cx={x(i)} cy={y(e.averages[s.key])} r="3" style={{ fill: s.color }} />
            ))}
          </g>
        ))}
      </svg>
      <ul className="chart-legend">
        {SERIES.map((s) => {
          const off = hidden.has(s.key)
          return (
            <li key={s.key}>
              <button
                type="button"
                className={`legend-btn ${off ? "legend-btn--off" : ""}`}
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
              >
                <span className="legend-dot" style={{ background: s.color }} />
                {s.label}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}