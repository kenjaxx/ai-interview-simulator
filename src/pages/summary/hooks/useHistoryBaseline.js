import { useEffect, useMemo, useState } from "react"
import { loadStats } from "../../../lib/history"
import { baselineFromStats } from "../../../lib/baseline"
import { averageScores } from "../../../lib/scores"

// Average of the user's earlier sessions in the same mode, for the summary's "vs your average".
// It reads the single rolling-stats document instead of a page of sessions. It waits until saving
// has settled so the session that was just finished can be left out:
//   saved    -> the new session is already counted in the stats, so it is subtracted again
//   skipped  -> private session, nothing was written, the stats are all earlier sessions
//   error    -> the save failed, so the stats are all earlier sessions
// state.status: "idle" | "loading" | "ready" | "none" | "error"
//
//   session  the finished session's entries, used to work out its own averages
export function useHistoryBaseline({ uid, saveStatus, mode, session }) {
  const [state, setState] = useState({ status: "idle", baseline: null })
  const settled = saveStatus === "saved" || saveStatus === "skipped" || saveStatus === "error"
  const current = useMemo(() => averageScores(session), [session])

  useEffect(() => {
    if (!uid || !settled) return
    let cancelled = false

    async function run() {
      setState({ status: "loading", baseline: null })
      try {
        // Cached after the first read. Saving clears the cache, so a freshly saved session always
        // triggers a real fetch.
        const stats = await loadStats(uid)
        if (cancelled) return
        const baseline = baselineFromStats(stats, mode, saveStatus === "saved" ? current : null)
        setState(baseline ? { status: "ready", baseline } : { status: "none", baseline: null })
      } catch (err) {
        console.error("Couldn't load history for the comparison:", err)
        if (!cancelled) setState({ status: "error", baseline: null })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [uid, settled, saveStatus, mode, current])

  return state
}