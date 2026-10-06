import { useState } from "react"

// Owns the typed text so keystrokes never re-render the app. Give it a `key` that changes per
// question so the box clears when the next question starts.
export default function TypingPanel({ onSubmit, maxLength = 4000 }) {
  const [text, setText] = useState("")

  return (
    <div className="typing-panel">
      <label htmlFor="typed-answer" className="sr-only">Your answer</label>
      <textarea
        id="typed-answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your answer here…"
        rows={6}
        maxLength={maxLength}
      />
      <button className="finish-btn" onClick={() => onSubmit(text)} disabled={!text.trim()}>
        Submit answer
      </button>
    </div>
  )
}