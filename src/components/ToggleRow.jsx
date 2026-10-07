import "./ModeToggle.css"

// A generic on/off row that reuses the Full AI Mode switch styling.
export default function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  disabledReason = "",
  label,
}) {
  return (
    <div className="mode-toggle">
      <div>
        <p className="mode-toggle-title">{title}</p>
        <p className="mode-toggle-sub">{disabled && disabledReason ? disabledReason : description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || title}
        disabled={disabled}
        className={`mode-switch ${checked ? "mode-switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="mode-switch-thumb" />
      </button>
    </div>
  )
}