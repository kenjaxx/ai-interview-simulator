import { useCallback, useEffect, useRef, useState } from "react"

const CONFIRM_WORDS = 20 // answers at least this long need a second press
const CONFIRM_WINDOW_MS = 4000 // how long the "press again" prompt stays armed

const countWords = (text) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0)

// While mounted, pressing Space or Enter calls onDone, unless the keypress belongs to something
// else (a button, a text box, a link, a <summary>, ...).
//
// Because the shortcut works from anywhere on the page, it is easy to hit by accident. For short
// answers it finishes straight away. Once the transcript is CONFIRM_WORDS or longer, the first press
// only arms it and shows a hint; a second press within CONFIRM_WINDOW_MS finishes the answer.
// Escape, or waiting, cancels. The "I'm done" button is not affected and always finishes at once.
//
//   onDone          finish the answer
//   getTranscript   () => the live transcript text, used to tell short answers from long ones
export default function DoneShortcut({ onDone, getTranscript }) {
  const [armed, setArmed] = useState(false)

  const onDoneRef = useRef(onDone)
  const getTranscriptRef = useRef(getTranscript)
  const armedRef = useRef(false)
  const timerRef = useRef(null)

  useEffect(() => {
    onDoneRef.current = onDone
    getTranscriptRef.current = getTranscript
  }, [onDone, getTranscript])

  const disarm = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    armedRef.current = false
    setArmed(false)
  }, [])

  useEffect(() => {
    const handler = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === "Escape") {
        if (armedRef.current) {
          event.preventDefault()
          disarm()
        }
        return
      }
      if (event.key !== " " && event.key !== "Enter") return

      const el = event.target
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(el.tagName))
      ) {
        return
      }

      event.preventDefault()

      // Second press inside the window: confirmed.
      if (armedRef.current) {
        disarm()
        onDoneRef.current?.()
        return
      }

      // Long answer: ask for a second press first.
      const words = countWords(getTranscriptRef.current?.())
      if (words >= CONFIRM_WORDS) {
        armedRef.current = true
        setArmed(true)
        timerRef.current = setTimeout(disarm, CONFIRM_WINDOW_MS)
        return
      }

      onDoneRef.current?.()
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      clearTimeout(timerRef.current)
    }
  }, [disarm])

  if (!armed) return null

  return (
    <p className="shortcut-confirm" role="status">
      Press <kbd>Space</kbd> or <kbd>Enter</kbd> again to finish, or <kbd>Esc</kbd> to keep going.
    </p>
  )
}