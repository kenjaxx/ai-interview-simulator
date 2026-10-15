import { memo, useMemo } from "react"
import { computeInsights } from "../../../lib/insights"

// tone: "good" | "focus"
function InsightCard({ tone, title, icon, items, empty }) {
  return (
    <div className={`insight-card insight-card--${tone}`}>
      <p className="insight-head">
        <span className={`insight-icon insight-icon--${tone}`} aria-hidden="true">
          {icon}
        </span>
        {title}
      </p>

      {items.length === 0 ? (
        <p className="insight-empty">{empty}</p>
      ) : (
        <ul className="insight-list">
          {items.map((item) => (
            <li key={item.id} className="insight-item">
              <span className={`insight-mark insight-mark--${tone}`} aria-hidden="true">
                {tone === "good" ? "✓" : "→"}
              </span>
              <span>
                <strong>{item.title}</strong>
                <span className="insight-detail">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Two short lists instead of a wall of feedback: what went well and what to fix first.
//   session  the finished session's entries
function StrengthsFocus({ session }) {
  const { strengths, focus } = useMemo(() => computeInsights(session), [session])
  if (!session?.length) return null

  return (
    <section className="insights-grid" aria-label="Strengths and focus areas">
      <InsightCard
        tone="good"
        title="Strengths"
        icon="✓"
        items={strengths}
        empty="No clear strengths yet. Longer, specific answers will give you some."
      />
      <InsightCard tone="focus" title="Work on next" icon="↗" items={focus} empty="Nothing urgent." />
    </section>
  )
}

export default memo(StrengthsFocus)