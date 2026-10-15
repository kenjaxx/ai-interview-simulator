import { useEffect, useState } from "react"

const LONG_ANSWER_SEC = 120

// Counts up from the moment it mounts. Give it a `key` that changes per question so it restarts.
// It owns its own state, so the ticking never re-renders the rest of the app.
export default function AnswerTimer() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  const long = seconds >= LONG_ANSWER_SEC

  return (
    <p className={`answer-timer ${long ? "answer-timer--long" : ""}`} role="timer" aria-live="off">
      ⏱ {minutes}:{rest}
      {long && <span> · most answers work best at 1–2 minutes</span>}
    </p>
  )
}
