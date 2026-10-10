import { useState, useRef, useCallback } from "react"
import { saveSession, newSessionId } from "../lib/history"

// Saving a finished session to Firestore, with retry. The session id is created once per finished
// session, so retrying overwrites the same document instead of creating a duplicate.
// interviewIdRef lets a late save result be ignored if the user already started over.
export function useSessionSave({ uid, interviewIdRef }) {
  const [saveStatus, setSaveStatus] = useState("idle") // "idle" | "saving" | "saved" | "error" | "skipped"
  const pendingSaveRef = useRef(null) // { sessionId, data } for the finished session, kept for retries

  const runSave = useCallback(
    async (interviewId) => {
      const pending = pendingSaveRef.current
      if (!pending || !uid) return
      setSaveStatus("saving")
      try {
        await saveSession(uid, pending.sessionId, pending.data)
        if (interviewIdRef.current === interviewId) setSaveStatus("saved")
      } catch (err) {
        console.error("Couldn't save session:", err)
        if (interviewIdRef.current === interviewId) setSaveStatus("error")
      }
    },
    [uid, interviewIdRef]
  )

  const queueSave = useCallback(
    (data, interviewId) => {
      if (!uid) return
      pendingSaveRef.current = { sessionId: newSessionId(uid), data }
      runSave(interviewId)
    },
    [uid, runSave]
  )

  // Private session: nothing is written to Firestore.
  const markSkipped = useCallback(() => {
    pendingSaveRef.current = null
    setSaveStatus("skipped")
  }, [])

  const resetSave = useCallback(() => {
    pendingSaveRef.current = null
    setSaveStatus("idle")
  }, [])

  const retrySave = useCallback(() => runSave(interviewIdRef.current), [runSave, interviewIdRef])

  return { saveStatus, queueSave, markSkipped, resetSave, retrySave }
}
