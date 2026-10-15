import { useCallback, useEffect, useRef, useState } from "react"
import {
  loadHistoryPage,
  getCachedHistory,
  getCachedStats,
  getCachedDetails,
  loadStats,
  loadSessionDetails,
  deleteSession,
} from "../lib/history"

// Loading, paging and deleting saved sessions, plus exact totals and per-session details.
// If History was opened before, the sessions and stats loaded then are shown instantly.
//
//   stats      { full, practice } totals across ALL sessions, or null while loading / if it failed
//              (the screen then falls back to the sessions loaded so far)
//   details    { [sessionId]: { status: "loading" | "ready" | "error", session } }
//              answers are fetched when a row is opened, not with the list
export function useHistory(uid) {
  const [initial] = useState(() => getCachedHistory(uid))
  const [initialStats] = useState(() => getCachedStats(uid))

  const [status, setStatus] = useState(initial ? "ready" : "loading") // "loading" | "ready" | "error"
  const [sessions, setSessions] = useState(initial?.sessions ?? [])
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false)
  const [stats, setStats] = useState(initialStats)
  const [details, setDetails] = useState({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applyEntry = useCallback((entry) => {
    setSessions(entry.sessions)
    setHasMore(entry.hasMore)
  }, [])

  // Exact totals. A failure is not fatal: the screen falls back to the loaded sessions.
  const loadStatsNow = useCallback(
    async (refresh = false) => {
      try {
        const next = await loadStats(uid, { refresh })
        if (mountedRef.current) setStats(next)
      } catch (err) {
        console.error("Couldn't load history stats:", err)
      }
    },
    [uid]
  )

  // Loads page 1. refresh=true throws away the cache first.
  const loadFirstPage = useCallback(
    async (refresh = false) => {
      setStatus("loading")
      if (refresh) loadStatsNow(true)
      try {
        const entry = await loadHistoryPage(uid, { refresh })
        if (!mountedRef.current) return
        applyEntry(entry)
        setStatus("ready")
      } catch (err) {
        console.error("Couldn't load history:", err)
        if (mountedRef.current) setStatus("error")
      }
    },
    [uid, applyEntry, loadStatsNow]
  )

  useEffect(() => {
    if (!initial) loadFirstPage(false)
  }, [initial, loadFirstPage])

  useEffect(() => {
    if (!initialStats) loadStatsNow(false)
  }, [initialStats, loadStatsNow])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const entry = await loadHistoryPage(uid)
      if (mountedRef.current) applyEntry(entry)
    } catch (err) {
      console.error("Couldn't load more history:", err)
      if (mountedRef.current) setLoadMoreError(true)
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [uid, loadingMore, applyEntry])

  // Fetches the answers of one session (one document). Safe to call again after an error.
  const loadDetails = useCallback(
    async (id) => {
      const cached = getCachedDetails(uid, id)
      if (cached) {
        setDetails((prev) => ({ ...prev, [id]: { status: "ready", session: cached } }))
        return
      }
      setDetails((prev) => ({ ...prev, [id]: { status: "loading", session: null } }))
      try {
        const qas = await loadSessionDetails(uid, id)
        if (mountedRef.current) setDetails((prev) => ({ ...prev, [id]: { status: "ready", session: qas } }))
      } catch (err) {
        console.error("Couldn't load session details:", err)
        if (mountedRef.current) setDetails((prev) => ({ ...prev, [id]: { status: "error", session: null } }))
      }
    },
    [uid]
  )

  // Resolves to true when the session was deleted.
  const remove = useCallback(
    async (id) => {
      setDeleteError(null)
      try {
        const nextStats = await deleteSession(uid, id)
        if (!mountedRef.current) return true
        setSessions((prev) => prev.filter((s) => s.id !== id))
        if (nextStats) setStats(nextStats)
        setDetails((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        return true
      } catch (err) {
        console.error("Couldn't delete session:", err)
        if (mountedRef.current) setDeleteError("Couldn't delete that session. Please try again.")
        return false
      }
    },
    [uid]
  )

  return {
    status,
    sessions,
    hasMore,
    stats,
    details,
    loadingMore,
    loadMoreError,
    deleteError,
    loadFirstPage,
    loadMore,
    loadDetails,
    remove,
  }
}