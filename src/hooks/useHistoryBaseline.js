import { useEffect, useState } from "react"
import { loadHistoryPage } from "../lib/history"
import { computeBaseline } from "../lib/baseline"

// Average of the user's earlier sessions in the same mode, for the summary's "vs your average".
// It waits until saving has settled so the session that was just finished can be left out:
//   saved    -> the new session is the newest saved one, so it is dropped from the list
//   skipped  -> private session, nothing was written, the list is all earlier sessions
//   error    -> the save failed, so the list is all earlier sessions
// state.status: "idle" | "loading" | "ready" | "none" | "error"
export function useHistoryBaseline({ uid, saveStatus, mode }) {
  const [state, setState] = useState({ status: "idle", baseline: null })
  const settled = saveStatus === "saved" || saveStatus === "skipped" || saveStatus === "error"

  useEffect(() => {
    if (!uid || !settled) return
    let cancelled = false

    async function run() {
      setState({ status: "loading", baseline: null })
      try {
        // Reuses the cached first page when there is one. Saving clears the cache, so a freshly
        // saved session always triggers a real fetch.
        const entry = await loadHistoryPage(uid)
        if (cancelled) return
        const earlier = saveStatus === "saved" ? entry.sessions.slice(1) : entry.sessions
        const baseline = computeBaseline(earlier, mode)
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
  }, [uid, settled, saveStatus, mode])

  return state
}