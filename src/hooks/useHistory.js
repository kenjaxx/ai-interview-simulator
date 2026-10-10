import { useCallback, useEffect, useRef, useState } from "react"
import { loadHistoryPage, getCachedHistory, deleteSession } from "../lib/history"

// Loading, paging and deleting saved sessions. If History was opened before, the sessions loaded
// then are shown instantly with no refetch.
export function useHistory(uid) {
  const [initial] = useState(() => getCachedHistory(uid))

  const [status, setStatus] = useState(initial ? "ready" : "loading") // "loading" | "ready" | "error"
  const [sessions, setSessions] = useState(initial?.sessions ?? [])
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false)
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

  // Loads page 1. refresh=true throws away the cache first.
  const loadFirstPage = useCallback(
    async (refresh = false) => {
      setStatus("loading")
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
    [uid, applyEntry]
  )

  useEffect(() => {
    if (!initial) loadFirstPage(false)
  }, [initial, loadFirstPage])

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

  // Resolves to true when the session was deleted.
  const remove = useCallback(
    async (id) => {
      setDeleteError(null)
      try {
        await deleteSession(uid, id)
        setSessions((prev) => prev.filter((s) => s.id !== id))
        return true
      } catch (err) {
        console.error("Couldn't delete session:", err)
        setDeleteError("Couldn't delete that session. Please try again.")
        return false
      }
    },
    [uid]
  )

  return {
    status,
    sessions,
    hasMore,
    loadingMore,
    loadMoreError,
    deleteError,
    loadFirstPage,
    loadMore,
    remove,
  }
}
