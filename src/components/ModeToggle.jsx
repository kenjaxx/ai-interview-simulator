import "./ModeToggle.css"

// mode: "practice" | "full"
// disabled: locks the switch (e.g. the AI quota is used up); disabledReason replaces the subtitle.
export default function ModeToggle({ mode, onChange, disabled = false, disabledReason = "" }) {
  const isFull = mode === "full"

  return (
    <div className="mode-toggle">
      <div>
        <p className="mode-toggle-title">{isFull ? "Full AI Mode" : "Practice Mode"}</p>
        <p className="mode-toggle-sub">
          {disabled && disabledReason
            ? disabledReason
            : isFull
              ? "Real Gemini feedback, STAR checks and sample answers. Uses one of your daily AI requests."
              : "Instant local scoring, unlimited runs — no AI request used."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isFull}
        aria-label="Toggle Full AI Mode"
        disabled={disabled}
        className={`mode-switch ${isFull ? "mode-switch--on" : ""}`}
        onClick={() => onChange(isFull ? "practice" : "full")}
      >
        <span className="mode-switch-thumb" />
      </button>
    </div>
  )
}
