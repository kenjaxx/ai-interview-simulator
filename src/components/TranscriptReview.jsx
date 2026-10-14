import { useState } from "react"
import "./TranscriptReview.css"

// The "Is this what you said?" step shown after a spoken answer. The recognizer often mangles
// technical terms, so the transcript can be corrected before it is scored.
//   initialText    what the recognizer heard
//   onSubmit(text) the (possibly edited) answer is ready to be scored
//   onRecordAgain  throw this away and answer again out loud
//   describedBy    id of the element that holds the question
//
// It owns the edited text, so keystrokes never re-render the app. Give it a `key` that changes
// per question so it starts fresh.
export default function TranscriptReview({
  initialText,
  onSubmit,
  onRecordAgain,
  maxLength = 4000,
  describedBy,
}) {
  const [text, setText] = useState(initialText)
  const trimmed = text.trim()
  const canSubmit = trimmed.length > 0
  const edited = trimmed !== initialText.trim()
  const words = canSubmit ? trimmed.split(/\s+/).length : 0

  const submit = () => {
    if (canSubmit) onSubmit(text)
  }

  return (
    <div className="typing-panel transcript-review" role="group" aria-labelledby="transcript-review-title">
      <div className="transcript-review-head">
        <p className="transcript-review-title" id="transcript-review-title">
          Is this what you said?
        </p>
        <p className="transcript-review-sub">
          Speech recognition can get technical terms wrong. Fix anything that's off before it's scored.
        </p>
      </div>

      <label htmlFor="transcript-edit" className="sr-only">
        Your transcribed answer
      </label>
      <textarea
        id="transcript-edit"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
        rows={6}
        maxLength={maxLength}
        aria-describedby={describedBy}
        spellCheck={false}
      />

      <p className="typing-hint">
        {words} {words === 1 ? "word" : "words"}
        {edited ? " · edited" : ""} · Ctrl/⌘ + Enter to submit
      </p>

      <p className="transcript-review-note">
        Pace, filler words and start time are measured from your voice, so editing the text won't change them.
      </p>

      <div className="transcript-review-actions">
        <button type="button" className="finish-btn" onClick={submit} disabled={!canSubmit}>
          ✓ Submit answer
        </button>
        <button type="button" className="secondary-btn" onClick={onRecordAgain}>
          Record again
        </button>
      </div>
    </div>
  )
}