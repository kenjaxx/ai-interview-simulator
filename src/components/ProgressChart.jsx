import { useState } from "react"
import { SERIES } from "../lib/trends"

// sessions: oldest first.
export default function ProgressChart({ sessions }) {
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

  const W = 600,
    H = 220,
    L = 34,
    R = 12,
    T = 12,
    B = 24
  const innerW = W - L - R
  const innerH = H - T - B
  const x = (i) => L + (i / (sessions.length - 1)) * innerW
  const y = (v) => T + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH

  return (
    <div className="chart-card">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Line chart of content, clarity and confidence scores across your sessions, oldest to newest"
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--line)" }} />
            <text x={L - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--t-muted)" }}>
              {tick}
            </text>
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
