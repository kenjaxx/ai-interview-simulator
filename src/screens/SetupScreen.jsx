import Header from "../components/Header"
import ModeToggle from "../components/ModeToggle"
import ToggleRow from "../components/ToggleRow"
import AnswerModePicker from "../components/AnswerModePicker"
import VoiceSettings from "../components/VoiceSettings"
import QuotaMeter from "../components/QuotaMeter"
import JobDescriptionInput from "../components/JobDescriptionInput"
import { ROLES, SENIORITIES } from "../lib/Options"
import { MIN_JD_CHARS, MAX_JD_CHARS } from "../lib/limits"
import { resetPhrase } from "../lib/time"

// setup: the `setup` object from useInterview().
export default function SetupScreen({ setup, onHistory }) {
  const jdReason =
    setup.aiMode !== "full"
      ? "Switch to Full AI Mode to tailor questions to a job description."
      : "You need at least 2 AI evaluations left (one for the questions, one for scoring)."

  const followUpReason =
    setup.aiMode !== "full"
      ? "Switch to Full AI Mode to get follow-up questions."
      : `You need at least ${1 + setup.maxFollowUps} AI evaluations left for follow-ups.`

  return (
    <div className="page">
      <Header onHistory={onHistory} />
      <header className="hero">
        <p className="eyebrow">AI Interview Coach</p>
        <h1 tabIndex={-1} data-screen-heading>
          Practice out loud.
          <br />
          Get real feedback.
        </h1>
        <p className="hero-sub">
          A live, voice-driven mock interview. Answer out loud, and once you're done the AI scores your
          content, clarity, and confidence based on what you actually said.
        </p>
      </header>

      <div className="setup-card">
        {setup.notice && (
          <p className="setup-notice" role="status">
            {setup.notice}
          </p>
        )}

        <div className="field">
          <label htmlFor="role">Target role</label>
          <select
            id="role"
            value={setup.role}
            onChange={(e) => setup.setRole(e.target.value)}
            disabled={setup.starting}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="seniority">Seniority</label>
          <select
            id="seniority"
            value={setup.seniority}
            onChange={(e) => setup.setSeniority(e.target.value)}
            disabled={setup.starting}
          >
            {SENIORITIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <AnswerModePicker
          value={setup.setupMode}
          onChange={setup.setInputPref}
          support={setup.support}
          mic={setup.mic}
        />

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

        <details className="advanced-options">
          <summary>
            More options
            <span className="advanced-sub">Voice &amp; accent, follow-ups, job description, privacy</span>
          </summary>

          <div className="advanced-body">
            <VoiceSettings
              support={setup.support}
              lang={setup.speechLang}
              onSelectAccent={setup.selectAccent}
              voices={setup.voices}
              voiceURI={setup.ttsVoiceURI}
              onVoice={setup.setTtsVoiceURI}
              rate={setup.ttsRate}
              onRate={setup.setTtsRate}
              onPreviewAccent={setup.previewAccent}
              onPreviewVoice={setup.previewVoice}
              onStopPreview={setup.stopPreview}
            />

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

        <button className="primary-btn" onClick={setup.start} disabled={setup.starting}>
          {setup.starting ? "Preparing your questions…" : "Start interview"}
        </button>
        <p className="setup-note">
          {setup.setupMode === "voice"
            ? `You'll need microphone access — ${setup.questionCount} questions, spoken answers.`
            : `${setup.questionCount} questions, typed answers.`}
        </p>

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
      </div>
    </div>
  )
}
