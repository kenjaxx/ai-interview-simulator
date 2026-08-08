import "./ModeToggle.css"

// mode: "practice" | "full"
export default function ModeToggle({ mode, onChange }) {
  const isFull = mode === "full"

  return (
    <div className="mode-toggle">
      <div>
        <p className="mode-toggle-title">
          {isFull ? "Full AI Mode" : "Practice Mode"}
        </p>
        <p className="mode-toggle-sub">
          {isFull
            ? "Real Gemini feedback based on what you actually said. Uses one of your daily AI requests."
            : "Instant local scoring, unlimited runs — no AI request used."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isFull}
        aria-label="Toggle Full AI Mode"
        className={`mode-switch ${isFull ? "mode-switch--on" : ""}`}
        onClick={() => onChange(isFull ? "practice" : "full")}
      >
        <span className="mode-switch-thumb" />
      </button>
    </div>
  )
}