import { useEffect } from "react"

// Renders nothing. When it mounts (i.e. a new screen has appeared), it scrolls to the top and moves
// focus to that screen's heading, so keyboard and screen-reader users aren't left on a control that
// no longer exists. If a text box already grabbed focus (the typing panel), focus stays there.
export default function ScreenFocus() {
  useEffect(() => {
    window.scrollTo({ top: 0 })
    const active = document.activeElement
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return
    document.querySelector("[data-screen-heading]")?.focus({ preventScroll: true })
  }, [])

  return null
}