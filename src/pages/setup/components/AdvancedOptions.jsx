import ToggleRow from "./ToggleRow"
import JobDescriptionInput from "./JobDescriptionInput"
import { MIN_JD_CHARS, MAX_JD_CHARS } from "../../../lib/limits"

// The collapsed "More options" section: follow-ups, job description, and saving to history.
export default function AdvancedOptions({ setup }) {
  const jdReason =
    setup.aiMode !== "full"
      ? "Switch to Full AI Mode to tailor questions to a job description."
      : "You need at least 2 AI evaluations left (one for the questions, one for scoring)."

  const followUpReason =
    setup.aiMode !== "full"
      ? "Switch to Full AI Mode to get follow-up questions."
      : `You need at least ${1 + setup.maxFollowUps} AI evaluations left for follow-ups.`

  return (
    <details className="advanced-options">
      <summary>
        More options
        <span className="advanced-sub">Follow-ups, job description, saving</span>
      </summary>

      <div className="advanced-body">
        <ToggleRow
          title="Follow-up questions"
          description={`After some answers the AI asks one probing follow-up based on what you said. Full AI Mode only. Uses up to ${setup.maxFollowUps} extra AI evaluations.`}
          checked={setup.followUps && setup.followUpsAvailable}
          onChange={setup.setFollowUps}
          disabled={!setup.followUpsAvailable || setup.starting}
          disabledReason={followUpReason}
          label="Toggle follow-up questions"
        />

        <JobDescriptionInput
          value={setup.jobDescription}
          onChange={setup.setJobDescription}
          available={setup.jdAvailable}
          unavailableReason={jdReason}
          min={MIN_JD_CHARS}
          max={MAX_JD_CHARS}
          disabled={setup.starting}
        />

        <ToggleRow
          title="Save sessions to my history"
          description={
            setup.saveHistory
              ? "Finished sessions, including your answers, are stored in your account."
              : "Private mode: this session won't be stored. In Full AI Mode your answers are still sent to Gemini for scoring."
          }
          checked={setup.saveHistory}
          onChange={setup.setSaveHistory}
          disabled={setup.starting}
          label="Toggle saving sessions to history"
        />
      </div>
    </details>
  )
}