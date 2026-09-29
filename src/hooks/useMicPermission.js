import { useState, useEffect, useCallback } from "react"

// Reports microphone permission without opening a stream, and offers a "test" that asks for it.
// The Permissions API isn't available everywhere (Firefox, older Safari), so "unknown" is a normal state.
export function useMicPermission() {
  const [state, setState] = useState("unknown") // "unknown" | "prompt" | "granted" | "denied" | "missing"
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!navigator.permissions?.query) return
    let cancelled = false
    let status = null

    navigator.permissions
      .query({ name: "microphone" })
      .then((s) => {
        if (cancelled) return
        status = s
        setState(s.state)
        s.onchange = () => setState(s.state)
      })
      .catch(() => {
        /* browser doesn't support querying the microphone permission */
      })

    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [])

  // Must be called from a click. Opens the mic just long enough to trigger the permission prompt.
  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    setTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setState("granted")
    } catch (err) {
      if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") setState("missing")
      else if (err?.name === "NotAllowedError" || err?.name === "SecurityError") setState("denied")
    } finally {
      setTesting(false)
    }
  }, [])

  return { state, testing, request }
}