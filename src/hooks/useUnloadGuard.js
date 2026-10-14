import { useEffect } from "react"

// While `active` is true, closing or refreshing the tab shows the browser's "Leave site?" prompt.
// The text of that prompt is fixed by the browser and can't be customized.
export function useUnloadGuard(active) {
  useEffect(() => {
    if (!active) return

    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = "" // required by older browsers
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [active])
}