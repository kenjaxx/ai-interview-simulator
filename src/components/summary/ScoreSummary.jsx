import { memo, useMemo } from "react"
import ScoreRing from "./ScoreRing"
import { averageScores } from "../../lib/scores"
import "./summary-ui.css"

const RINGS = [
  { key: "content", label: "Content", color: "var(--s-content)" },
  { key: "clarity", label: "Clarity", color: "var(--s-clarity)" },
  { key: "confidence", label: "Confidence", color: "var(--s-confidence)" },
]

// Score rings for the session, with "vs your average" under each ring once there is history.
//   baseline  { status, baseline } from useHistoryBaseline()
function ScoreSummary({ session, baseline, sessionMode }) {
  const avg = useMemo(() => averageScores(session), [session])
  if (!session?.length) return null

  const base = baseline.status === "ready" ? baseline.baseline : null
  const delta = (key) => (base ? avg[key] - base[key] : null)
  const modeName = sessionMode === "full" ? "Full AI" : "Practice"

  let note
  if (base) {
    note = `Compared with your average across your last ${base.count} ${modeName} session${base.count === 1 ? "" : "s"}.`
  } else if (baseline.status === "none") {
    note = `This is your first ${modeName} session on record, so there's nothing to compare against yet.`
  } else if (baseline.status === "error") {
    note = "Couldn't load your history to compare."
  } else {
    note = "Comparing with your history…"
  }

  return (
    <section className="score-summary" aria-label="Session scores">
      <div className="rings-main">
        <ScoreRing
          value={avg.overall}
          label="Overall"
          color="var(--accent)"
          size={120}
          stroke={10}
          delta={delta("overall")}
        />
      </div>
      <div className="rings-row">
        {RINGS.map((r) => (
          <ScoreRing key={r.key} value={avg[r.key]} label={r.label} color={r.color} delta={delta(r.key)} />
        ))}
      </div>
      <p className="baseline-note" role="status">
        {note}
      </p>
    </section>
  )
}

export default memo(ScoreSummary)