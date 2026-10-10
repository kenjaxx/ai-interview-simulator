import { useState, useRef, useCallback, useEffect } from "react"
import { fetchUsage } from "../lib/gemini"
import { FOLLOW_UP_SETUP_QUOTA } from "../lib/interviewConfig"

// A quota reading younger than this is reused instead of asking the server again.
const FRESH_FOR_MS = 60_000

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10)

// Tracks how many AI evaluations the user has left today, and derives what that allows.
// quota: { remaining, limit, globalExhausted } from the server, or null while unknown.
//
// Fetching is deduplicated and cached:
//   - Every server response (a usage lookup, or the usage returned by an evaluation, question
//     generation or follow-up) marks the quota as freshly synced.
//   - Returning to the setup screen only refetches when the reading is older than FRESH_FOR_MS,
//     belongs to a previous UTC day (the server's daily reset), or doesn't exist yet.
//   - The "Retry" button in the quota meter always refetches.
//   - Simultaneous requests for the same user share one network call (see fetchUsage).
export function useQuota({ uid, screen, aiMode }) {
  const [quota, setQuota] = useState(null)
  const [quotaStatus, setQuotaStatus] = useState("idle") // "idle" | "loading" | "ready" | "error"
  const quotaRef = useRef(null) // mirrors `quota` so async code never reads a stale value
  const syncedAtRef = useRef(0) // when `quota` last came from the server
  const uidRef = useRef(uid) // lets a late response for a signed-out user be dropped

  useEffect(() => {
    uidRef.current = uid
  }, [uid])

  const commitQuota = useCallback((next) => {
    quotaRef.current = next
    syncedAtRef.current = next ? Date.now() : 0
    setQuota(next)
  }, [])

  const applyUsage = useCallback(
    (info) => {
      if (!info) return
      commitQuota({ remaining: info.remaining, limit: info.limit, globalExhausted: false })
    },
    [commitQuota]
  )

  const load = useCallback(
    async (force) => {
      if (!uid) return

      if (!force && quotaRef.current) {
        const now = Date.now()
        const fresh = now - syncedAtRef.current < FRESH_FOR_MS && utcDay(now) === utcDay(syncedAtRef.current)
        if (fresh) {
          setQuotaStatus("ready")
          return
        }
      }

      setQuotaStatus("loading")
      try {
        const latest = await fetchUsage(uid)
        if (uidRef.current !== uid) return // the user signed out or switched while we waited
        if (latest) commitQuota(latest)
        setQuotaStatus("ready")
      } catch (err) {
        console.error("Couldn't load AI quota:", err)
        if (uidRef.current === uid) setQuotaStatus("error")
      }
    },
    [uid, commitQuota]
  )

  // Manual refresh (the Retry button): always asks the server. Takes no arguments on purpose, so
  // passing it straight to onClick can't leak the click event in as an option.
  const refreshQuota = useCallback(() => load(true), [load])

  // Forgets everything (used on sign-out).
  const resetQuota = useCallback(() => {
    commitQuota(null)
    setQuotaStatus("idle")
  }, [commitQuota])

  // Whenever the setup screen is shown: refetch only if what we have is missing or stale.
  useEffect(() => {
    if (uid && screen === "setup") load(false)
  }, [uid, screen, load])

  // Full AI is blocked only when the server says so. While the quota is unknown (loading, failed),
  // Full AI stays available and the server enforces the limit anyway.
  const quotaExhausted = !!quota && (quota.remaining <= 0 || quota.globalExhausted)
  // The stored preference is kept as-is, but the mode actually used drops to Practice while exhausted.
  const effectiveMode = aiMode === "full" && !quotaExhausted ? "full" : "practice"
  // Tailored questions cost one evaluation and scoring needs another, so require two.
  const jdAvailable = effectiveMode === "full" && (!quota || quota.remaining >= 2)
  // Follow-ups need Full AI Mode and enough quota for scoring plus the follow-ups themselves.
  const followUpsAvailable = effectiveMode === "full" && (!quota || quota.remaining >= FOLLOW_UP_SETUP_QUOTA)

  return {
    quota,
    quotaRef,
    quotaStatus,
    quotaExhausted,
    effectiveMode,
    jdAvailable,
    followUpsAvailable,
    applyUsage,
    refreshQuota,
    resetQuota,
  }
}