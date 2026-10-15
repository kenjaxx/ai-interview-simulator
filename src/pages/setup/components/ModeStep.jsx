import ModeToggle from "./ModeToggle"
import QuotaMeter from "./QuotaMeter"
import AnswerModePicker from "./AnswerModePicker"
import SessionOptions from "./SessionOptions"
import { resetPhrase } from "../../../lib/time"

// Step 2: how to practice: scoring mode, spoken or typed answers (with a mic test), length and question type.
export default function ModeStep({ setup }) {
  return (
    <>
      <ModeToggle
        mode={setup.aiMode}
        onChange={setup.setAiMode}
        disabled={setup.quotaExhausted}
        disabledReason={
          setup.quota?.globalExhausted
            ? "The app's daily AI budget is used up, so Full AI Mode is unavailable right now."
            : `You've used all of today's AI evaluations, so Full AI Mode is locked until ${resetPhrase()}.`
        }
      />

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