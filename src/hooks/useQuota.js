import { useState, useRef, useCallback, useEffect } from "react"
import { fetchUsage } from "../lib/gemini"
import { FOLLOW_UP_SETUP_QUOTA } from "../lib/interviewConfig"

// Tracks how many AI evaluations the user has left today, and derives what that allows.
// quota: { remaining, limit, globalExhausted } from the server, or null while unknown.
export function useQuota({ uid, screen, aiMode }) {
  const [quota, setQuota] = useState(null)
  const [quotaStatus, setQuotaStatus] = useState("idle") // "idle" | "loading" | "ready" | "error"
  const quotaRef = useRef(null) // mirrors `quota` so async code never reads a stale value

  const commitQuota = useCallback((next) => {
    quotaRef.current = next
    setQuota(next)
  }, [])

  const applyUsage = useCallback(
    (info) => {
      if (!info) return
      commitQuota({ remaining: info.remaining, limit: info.limit, globalExhausted: false })
    },
    [commitQuota]
  )

  const refreshQuota = useCallback(async () => {
    if (!uid) return
    setQuotaStatus("loading")
    try {
      const latest = await fetchUsage()
      if (latest) commitQuota(latest)
      setQuotaStatus("ready")
    } catch (err) {
      console.error("Couldn't load AI quota:", err)
      setQuotaStatus("error")
    }
  }, [uid, commitQuota])

  // Forgets everything (used on sign-out).
  const resetQuota = useCallback(() => {
    commitQuota(null)
    setQuotaStatus("idle")
  }, [commitQuota])

  // Refresh whenever the setup screen is shown (first load, and after finishing an interview).
  useEffect(() => {
    if (uid && screen === "setup") refreshQuota()
  }, [uid, screen, refreshQuota])

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
