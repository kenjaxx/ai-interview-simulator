import { memo, useMemo } from "react"
import { computeTrends } from "../lib/trends"

function Sparkline({ values, color }) {
  const W = 84,
    H = 26,
    P = 2
  const pts = values
    .map((v, i) => {
      const x = P + (i / (values.length - 1)) * (W - 2 * P)
      const y = P + (H - 2 * P) - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P)
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        style={{ stroke: color }}
      />
    </svg>
  )
}

// sessions: oldest first. Compares the most recent few sessions with the few before them.
function TrendCards({ sessions }) {
  const trends = useMemo(() => computeTrends(sessions), [sessions])
  if (!trends) return null

  const { w, rows, weakest } = trends

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

export default memo(TrendCards)