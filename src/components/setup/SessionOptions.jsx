import SegmentedControl from "../SegmentedControl"
import { SESSION_LENGTHS, QUESTION_TYPES, CUSTOM_ROLE } from "../../lib/Options"

const LENGTH_NAMES = { 3: "Quick", 6: "Standard", 10: "Deep" }

const TYPE_HINTS = {
  mixed: "A blend of past-experience and role questions.",
  behavioral: "Past-experience questions like “Tell me about a time…”. Good for STAR practice.",
  technical: "Role-specific how-to and design questions, with the role's own questions first.",
}

// Session length (3, 6 or 10 questions) and question type (mixed, behavioral, technical).
export default function SessionOptions({ setup }) {
  const lengthOptions = SESSION_LENGTHS.map((n) => ({ value: n, label: `${n} · ${LENGTH_NAMES[n] ?? ""}`.trim() }))
  const typeOptions = QUESTION_TYPES.map((t) => ({ value: t.id, label: t.label }))
  const customTechnical = setup.role === CUSTOM_ROLE && setup.questionType === "technical"

  return (
    <>
      <div className="field">
        <span className="field-label" id="length-label">
          Number of questions
        </span>
        <SegmentedControl
          labelId="length-label"
          options={lengthOptions}
          value={setup.questionCount}
          onChange={setup.setQuestionCount}
          disabled={setup.starting}
        />
        <p className="mode-notice">About {setup.questionCount * 2} minutes, plus time to review your feedback.</p>
      </div>

      <div className="field">
        <span className="field-label" id="type-label">
          Question type
        </span>
        <SegmentedControl
          labelId="type-label"
          options={typeOptions}
          value={setup.questionType}
          onChange={setup.setQuestionType}
          disabled={setup.starting}
        />
        <p className="mode-notice">{TYPE_HINTS[setup.questionType]}</p>
        {customTechnical && (
          <p className="mode-notice mode-notice--warn">
            The built-in bank has no technical questions for a custom role. Use Full AI Mode and paste a job
            description to get role-specific ones.
          </p>
        )}
      </div>
    </>
  )
}