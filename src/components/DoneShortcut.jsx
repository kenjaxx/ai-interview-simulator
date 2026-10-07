import { useEffect, useRef } from "react"

// Renders nothing. While mounted, pressing Space or Enter calls onDone, unless the keypress
// belongs to something else (a button, a text box, a link, a <summary>, ...).
export default function DoneShortcut({ onDone }) {
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const handler = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== " " && event.key !== "Enter") return

      const el = event.target
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(el.tagName))
      ) {
        return
      }

      event.preventDefault()
      onDoneRef.current?.()
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return null
}