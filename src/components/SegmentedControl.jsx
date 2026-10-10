import { onRadioGroupKeyDown } from "../lib/radioKeys"
import "./AnswerModePicker.css" // the .answer-mode / .answer-mode-btn styles live there

// A row of mutually exclusive buttons that behaves as one radio group:
// Tab enters on the checked option, arrow keys move between options, Home/End jump to the ends.
//   labelId  id of the element that labels the group
//   options  [{ value, label, disabled? }]
export default function SegmentedControl({ labelId, options, value, onChange, disabled = false }) {
  // The one option that is a tab stop: the checked one, or the first enabled one if that is disabled.
  const checked = options.find((o) => o.value === value && !o.disabled)
  const focusable = (checked ?? options.find((o) => !o.disabled))?.value

  return (
    <div className="answer-mode" role="radiogroup" aria-labelledby={labelId} onKeyDown={onRadioGroupKeyDown}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={o.value === focusable ? 0 : -1}
            disabled={disabled || o.disabled}
            className={`answer-mode-btn ${active ? "answer-mode-btn--on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}