import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "./FullAiNotice.css"

const STEPS = [
  { n: 1, label: "Main model" },
  { n: 2, label: "Backup model" },
  { n: 3, label: "Main again" },
]

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Warns that Full AI Mode runs on Gemini's free tier, which can be overloaded.
//   continueLabel     text on the main button (it turns Full AI on, or starts the interview)
//   secondaryLabel    text on the quiet button (it backs out without enabling anything)
//   onContinue(dontShowAgain)  the user accepted; dontShowAgain is the checkbox value
//   onSecondary()     the quiet button was pressed
//   onClose()         Escape or a click outside the dialog
//
// It renders in a portal on document.body: the setup card has a transform animation, and a fixed
// element inside a transformed parent would be positioned against the card instead of the screen.
export default function FullAiNotice({ continueLabel, secondaryLabel, onContinue, onSecondary, onClose }) {
  const [dontShow, setDontShow] = useState(false)
  const dialogRef = useRef(null)
  const primaryRef = useRef(null)
  const titleId = useId()
  const descId = useId()

  // Move focus into the dialog, and give it back to whatever had it when the dialog closes.
  useEffect(() => {
    const previous = document.activeElement
    primaryRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [])

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== "Tab") return

    // Keep Tab inside the dialog.
    const items = dialogRef.current?.querySelectorAll(FOCUSABLE)
    if (!items || items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="notice-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <span className="notice-handle" aria-hidden="true" />

        <div className="notice-head">
          <span className="notice-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <h2 id={titleId} className="notice-title">
            The AI may be busy
          </h2>
        </div>

        <p id={descId} className="notice-text">
          Full AI Mode uses Google's free Gemini service. When it's overloaded, the app retries for you, up to
          3 times.
        </p>

        <ol className="notice-steps" aria-label="Automatic retries">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="notice-step-dot">{step.n}</span>
              <span className="notice-step-label">{step.label}</span>
            </li>
          ))}
        </ol>

        <p className="notice-foot">
          Still failing? Press Retry, or score with Practice Mode. It's a free-tier limit, not a problem on
          your side.
        </p>

        <label className="notice-check">
          <input type="checkbox" checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} />
          Don't show this again
        </label>

        <div className="notice-actions">
          <button type="button" className="primary-btn" ref={primaryRef} onClick={() => onContinue(dontShow)}>
            {continueLabel}
          </button>
          <button type="button" className="secondary-btn" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}