// quota: { remaining, limit, globalExhausted } | null
// status: "idle" | "loading" | "ready" | "error"
export default function QuotaMeter({ quota, status, onRefresh }) {
  if (!quota) {
    if (status === "error") {
      return (
        <p className="quota-meter quota-meter--muted" role="status">
          Couldn't check your AI quota.{" "}
          <button type="button" className="link-btn" onClick={onRefresh}>Retry</button>
        </p>
      )
    }
    if (status === "loading") {
      return <p className="quota-meter quota-meter--muted" role="status">Checking your AI quota…</p>
    }
    return null
  }

  const { remaining, limit, globalExhausted } = quota
  const pct = limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0
  const empty = globalExhausted || remaining <= 0

  let text
  if (globalExhausted) text = "The app's daily AI budget is used up. Practice Mode still works."
  else if (remaining <= 0) text = "You've used all of today's AI evaluations. They reset at midnight UTC."
  else text = `${remaining} of ${limit} AI evaluations left today`

  return (
    <div className={`quota-meter ${empty ? "quota-meter--empty" : ""}`} role="status">
      <div className="quota-bar" aria-hidden="true">
        <div className="quota-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="quota-text">{text}</p>
    </div>
  )
}