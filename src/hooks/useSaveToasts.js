import { useEffect, useRef } from "react"
import { useToast } from "../context/ToastContext"

// Shows a toast when a session save finishes or fails. Only changes seen while mounted count, so
// coming back to the summary (after a retry) doesn't repeat "saved".
export function useSaveToasts(saveStatus) {
  const toast = useToast()
  const previous = useRef(saveStatus)

  useEffect(() => {
    if (previous.current === saveStatus) return
    previous.current = saveStatus
    if (saveStatus === "saved") toast.success("Session saved to your history.")
    else if (saveStatus === "error") toast.error("Couldn't save this session. Use Retry save below.")
  }, [saveStatus, toast])
}