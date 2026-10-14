import { memo, useState, useRef } from "react"
import { SERIES } from "../lib/trends"

const W = 600
const H = 236
const L = 34
const R = 12
const T = 12
const B = 30
const MAX_LABELS = 5

const validDate = (d) => d instanceof Date && !Number.isNaN(d.getTime())
const shortDate = (d) => (validDate(d) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Now")
const fullDate = (d) =>
  validDate(d) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Just now"
const modeName = (mode) => (mode === "full" ? "Full AI" : "Practice")

// Which sessions get a date label: all of them when there are few, otherwise evenly spaced
// including the first and the last.
function labelIndexes(count) {
  if (count <= MAX_LABELS) return Array.from({ length: count }, (_, i) => i)
  const out = new Set()
  for (let k = 0; k < MAX_LABELS; k++) out.add(Math.round((k * (count - 1)) / (MAX_LABELS - 1)))
  return [...out]
}

// sessions: oldest first. Memoized: HistoryScreen passes a memoized array, so the chart only
// redraws when the visible sessions change, not when a row is expanded or a delete is confirmed.
//
// Hover (mouse) or tap/drag (touch) shows a tooltip for the nearest session. The chart is also
// focusable: Left/Right/Home/End move between sessions and Escape closes the tooltip.
function ProgressChart({ sessions }) {
  const [hidden, setHidden] = useState(() => new Set())
  const [active, setActive] = useState(null)
  const svgRef = useRef(null)

  const count = sessions.length

  if (count < 2) {
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

  const innerW = W - L - R
  const innerH = H - T - B
  const x = (i) => L + (i / (count - 1)) * innerW
  const y = (v) => T + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH

  // The list can shrink (a session was deleted) while a tooltip is open.
  const activeIndex = active !== null && active < count ? active : null
  const activeSession = activeIndex !== null ? sessions[activeIndex] : null

  const pick = (event) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return
    const px = ((event.clientX - rect.left) / rect.width) * W
    const ratio = (px - L) / innerW
    setActive(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))))
  }

  const onKeyDown = (event) => {
    const last = count - 1
    const current = activeIndex ?? (event.key === "ArrowLeft" || event.key === "End" ? last + 1 : -1)
    let next = null
    if (event.key === "ArrowRight") next = Math.min(last, current + 1)
    else if (event.key === "ArrowLeft") next = Math.max(0, current - 1)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    else if (event.key === "Escape" && activeIndex !== null) {
      event.preventDefault()
      setActive(null)
      return
    }
    if (next === null) return
    event.preventDefault()
    setActive(next)
  }

  const spoken = activeSession
    ? `${fullDate(activeSession.createdAt)}, ${activeSession.role}, ${modeName(activeSession.mode)}. ` +
      SERIES.map((s) => `${s.label} ${activeSession.averages[s.key]}`).join(", ") +
      `. Overall ${activeSession.averages.overall}.`
    : ""

  const labels = labelIndexes(count)
  const pct = activeIndex !== null ? (x(activeIndex) / W) * 100 : 0
  const align = pct < 25 ? "start" : pct > 75 ? "end" : "center"

  return (
    <div className="chart-card">
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          aria-label="Line chart of content, clarity and confidence scores across your sessions, oldest to newest. Use the arrow keys to read each session."
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--line)" }} />
              <text x={L - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--t-muted)" }}>
                {tick}
              </text>
            </g>
          ))}

          {labels.map((i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={H - B} y2={H - B + 4} style={{ stroke: "var(--line-strong)" }} />
              <text
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"}
                fontSize="11"
                style={{ fill: "var(--t-muted)" }}
              >
                {shortDate(sessions[i].createdAt)}
              </text>
            </g>
          ))}

          {activeIndex !== null && (
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={T}
              y2={H - B}
              strokeDasharray="3 3"
              style={{ stroke: "var(--line-strong)" }}
            />
          )}

          {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
            <g key={s.key}>
              <polyline
                fill="none"
                strokeWidth="2"
                style={{ stroke: s.color }}
                points={sessions.map((e, i) => `${x(i)},${y(e.averages[s.key])}`).join(" ")}
              />
              {sessions.map((e, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(e.averages[s.key])}
                  r={i === activeIndex ? 5 : 3}
                  style={{ fill: s.color }}
                />
              ))}
            </g>
          ))}
        </svg>

        {activeSession && (
          <div
            className={`chart-tooltip chart-tooltip--${align}`}
            style={{ left: `${pct}%` }}
            aria-hidden="true"
          >
            <div className="chart-tooltip-date">{fullDate(activeSession.createdAt)}</div>
            <div className="chart-tooltip-meta">
              {activeSession.role} · {activeSession.seniority}
            </div>
            <div className="chart-tooltip-meta">{modeName(activeSession.mode)}</div>
            {SERIES.map((s) => (
              <div
                key={s.key}
                className={`chart-tooltip-row ${hidden.has(s.key) ? "chart-tooltip-row--off" : ""}`}
              >
                <span className="chart-tooltip-dot" style={{ background: s.color }} />
                {s.label}
                <strong>{activeSession.averages[s.key]}</strong>
              </div>
            ))}
            <div className="chart-tooltip-row chart-tooltip-overall">
              Overall
              <strong>{activeSession.averages.overall}</strong>
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {spoken}
      </p>

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

export default memo(ProgressChart)