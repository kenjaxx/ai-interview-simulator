import { useState } from "react"

// Owns the typed text so keystrokes never re-render the app. Give it a `key` that changes per
// question so the box clears when the next question starts.
// describedBy: id of the element that holds the question, so screen readers read it with the box.
export default function TypingPanel({ onSubmit, maxLength = 4000, describedBy }) {
  const [text, setText] = useState("")
  const canSubmit = text.trim().length > 0
  const words = canSubmit ? text.trim().split(/\s+/).length : 0

  const submit = () => {
    if (canSubmit) onSubmit(text)
  }

  return (
    <div className="typing-panel">
      <label htmlFor="typed-answer" className="sr-only">Your answer</label>
      <textarea
        id="typed-answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Type your answer here…"
        rows={6}
        maxLength={maxLength}
        aria-describedby={describedBy}
        autoFocus
      />
      <p className="typing-hint">
        {words} {words === 1 ? "word" : "words"} · Ctrl/⌘ + Enter to submit
      </p>
      <button className="finish-btn" onClick={submit} disabled={!canSubmit}>
        Submit answer
      </button>
    </div>
  )
}