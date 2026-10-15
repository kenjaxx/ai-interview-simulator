import ModeToggle from "./ModeToggle"
import QuotaMeter from "./QuotaMeter"
import AnswerModePicker from "./AnswerModePicker"
import SessionOptions from "./SessionOptions"
import { resetPhrase } from "../../../lib/time"

// Step 2: how to practice: scoring mode, spoken or typed answers (with a mic test), length and question type.
export default function ModeStep({ setup }) {
  let reason
  if (setup.requiresFullAi && !setup.quotaExhausted) {
    reason = "Custom roles always use Full AI Mode, so the AI can write questions for your role."
  } else if (setup.quota?.globalExhausted) {
    reason = "The app's daily AI budget is used up, so Full AI Mode is unavailable right now."
  } else {
    reason = `You've used all of today's AI evaluations, so Full AI Mode is locked until ${resetPhrase()}.`
  }

  return (
    <>
      <ModeToggle
        mode={setup.aiMode}
        onChange={setup.setAiMode}
        disabled={setup.quotaExhausted || setup.requiresFullAi}
        disabledReason={reason}
      />

      {setup.customRoleBlocked && (
        <p className="mode-notice mode-notice--warn" role="status">
          Your custom role needs 2 AI evaluations (questions + scoring), and you don't have enough left. Pick a
          preset role to use Practice Mode.
        </p>
      )}

      <QuotaMeter quota={setup.quota} status={setup.quotaStatus} onRefresh={setup.refreshQuota} />

      <AnswerModePicker
        value={setup.setupMode}
        onChange={setup.setInputPref}
        support={setup.support}
        mic={setup.mic}
      />

      <SessionOptions setup={setup} />
    </>
  )
}