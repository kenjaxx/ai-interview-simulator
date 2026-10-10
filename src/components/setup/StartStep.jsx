import AdvancedOptions from "./AdvancedOptions"
import { QUESTION_TYPES } from "../../lib/Options"

// Step 3: a summary of the choices, the collapsed advanced options, and the privacy details.
// The "Start interview" button lives in SetupScreen's navigation row.
export default function StartStep({ setup }) {
  const typeLabel = QUESTION_TYPES.find((t) => t.id === setup.questionType)?.label ?? "Mixed"

  return (
    <>
      <dl className="setup-summary">
        <dt>Role</dt>
        <dd>{setup.effectiveRole}</dd>
        <dt>Level</dt>
        <dd>{setup.seniority}</dd>
        <dt>Scoring</dt>
        <dd>{setup.aiMode === "full" ? "Full AI Mode" : "Practice Mode"}</dd>
        <dt>Answers</dt>
        <dd>{setup.setupMode === "voice" ? "Spoken" : "Typed"}</dd>
        <dt>Session</dt>
        <dd>
          {setup.questionCount} questions · {typeLabel}
        </dd>
      </dl>

      <AdvancedOptions setup={setup} />

      <details className="privacy-details">
        <summary>Privacy details</summary>
        <p>
          Speech-to-text is done by your browser, and Chrome and Edge send audio to their own cloud services
          for that. In Full AI Mode, your answers (and a job description, if you paste one) are also sent to
          Google's Gemini API.{" "}
          {setup.saveHistory
            ? "Finished sessions, including your answers, are saved to your account so you can track progress, and you can delete any of them from History."
            : "Sessions are not saved to your account while the save toggle is off."}
        </p>
      </details>
    </>
  )
}