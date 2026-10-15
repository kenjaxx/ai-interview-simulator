const STEPS = ["Role", "Mode", "Start"]

// step: current step index. reached: furthest step visited. onJump(index) moves to a step.
// Steps can be revisited once reached, so a long setup never traps the user.
export default function Stepper({ step, reached, onJump, disabled = false }) {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo"
        return (
          <li
            key={label}
            className={`stepper-item stepper-item--${state}`}
            aria-current={i === step ? "step" : undefined}
          >
            <button
              type="button"
              className="stepper-btn"
              disabled={disabled || i > reached}
              onClick={() => onJump(i)}
            >
              <span className="stepper-dot" aria-hidden="true">
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className="stepper-label">{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}