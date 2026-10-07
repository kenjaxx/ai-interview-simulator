import Orb from "./components/Orb"
import Header from "./components/Header"
import Login from "./components/Login"
import ModeToggle from "./components/ModeToggle"
import ToggleRow from "./components/ToggleRow"
import AnswerModePicker from "./components/AnswerModePicker"
import VoiceSettings from "./components/VoiceSettings"
import SessionReview from "./components/SessionReview"
import HistoryScreen from "./components/HistoryScreen"
import LiveTranscript from "./components/LiveTranscript"
import TypingPanel from "./components/TypingPanel"
import QuotaMeter from "./components/QuotaMeter"
import JobDescriptionInput from "./components/JobDescriptionInput"
import RetryCard from "./components/RetryCard"
import ExportPdfButton from "./components/ExportPdfButton"
import { useAuth } from "./context/AuthContext"
import { useInterview, MIN_JD_CHARS, MAX_JD_CHARS } from "./hooks/UseInterview"
import { ROLES, SENIORITIES } from "./lib/Options"
import "./App.css"

export default function App() {
  const { user, authLoading } = useAuth()
  const { screen, setScreen, setup, interview, summary } = useInterview({ user, authLoading })

  if (authLoading) {
    return (
      <div className="page-loading">
        <div className="page-loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (screen === "history") {
    return (
      <div className="page">
        <Header />
        <HistoryScreen uid={user.uid} onBack={() => setScreen("setup")} />
      </div>
    )
  }

  // ---------- setup ----------
  if (screen === "setup") {
    const jdReason = setup.aiMode !== "full"
      ? "Switch to Full AI Mode to tailor questions to a job description."
      : "You need at least 2 AI evaluations left (one for the questions, one for scoring)."

    const followUpReason = setup.aiMode !== "full"
      ? "Switch to Full AI Mode to get follow-up questions."
      : `You need at least ${1 + setup.maxFollowUps} AI evaluations left for follow-ups.`

    return (
      <div className="page">
        <Header onHistory={() => setScreen("history")} />
        <header className="hero">
          <p className="eyebrow">AI Interview Coach</p>
          <h1>Practice out loud.<br />Get real feedback.</h1>
          <p className="hero-sub">
            A live, voice-driven mock interview. Answer out loud, and once you're
            done the AI scores your content, clarity, and confidence based on what you actually said.
          </p>
        </header>

        <div className="setup-card">
          {setup.notice && <p className="setup-notice" role="status">{setup.notice}</p>}

          <div className="field">
            <label htmlFor="role">Target role</label>
            <select id="role" value={setup.role} onChange={(e) => setup.setRole(e.target.value)} disabled={setup.starting}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
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

          <AnswerModePicker value={setup.setupMode} onChange={setup.setInputPref} support={setup.support} mic={setup.mic} />
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

          <ModeToggle
            mode={setup.aiMode}
            onChange={setup.setAiMode}
            disabled={setup.quotaExhausted}
            disabledReason={
              setup.quota?.globalExhausted
                ? "The app's daily AI budget is used up, so Full AI Mode is unavailable right now."
                : "You've used all of today's AI evaluations, so Full AI Mode is locked until midnight UTC."
            }
          />

          <QuotaMeter quota={setup.quota} status={setup.quotaStatus} onRefresh={setup.refreshQuota} />

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

          <button className="primary-btn" onClick={setup.start} disabled={setup.starting}>
            {setup.starting ? "Preparing your questions…" : "Start interview"}
          </button>
          <p className="setup-note">
            {setup.setupMode === "voice"
              ? `You'll need microphone access — ${setup.questionCount} questions, spoken answers.`
              : `${setup.questionCount} questions, typed answers.`}
          </p>
          <p className="setup-note">
            Privacy: speech-to-text is done by your browser, and Chrome and Edge send audio to their
            own cloud services for that. In Full AI Mode, your answers (and a job description, if you
            paste one) are also sent to Google's Gemini API.{" "}
            {setup.saveHistory
              ? "Finished sessions, including your answers, are saved to your account so you can track progress, and you can delete any of them from History."
              : "Sessions are not saved to your account while the save toggle is off."}
          </p>
        </div>
      </div>
    )
  }

  // ---------- interview (also used for retrying one answer) ----------
  if (screen === "interview") {
    const {
      isRetry,
      awaitingFinalScore: scoring,
      inputMode,
      isListening,
      error,
      isFollowUp,
      preparingFollowUp,
    } = interview
    const busy = scoring || preparingFollowUp

    let progress
    if (preparingFollowUp) {
      progress = "Thinking of a follow-up…"
    } else if (scoring) {
      progress = isRetry ? "Scoring your retry…" : "Scoring your interview…"
    } else if (isRetry) {
      progress = `Retry · re-answering answer ${interview.retryQuestionNumber}`
    } else if (isFollowUp) {
      progress = `Follow-up · question ${Math.min(interview.questionIndex + 1, interview.questionTotal)} of ${interview.questionTotal}`
    } else {
      progress = `Question ${Math.min(interview.questionIndex + 1, interview.questionTotal)} of ${interview.questionTotal} · ${interview.answeredCount} answered`
    }

    return (
      <div className="page">
        <Header />
        <div className="interview-shell">
          <p className="progress-label">{progress}</p>

          <Orb state={interview.orbState} getLevel={interview.getLevel} subscribeWord={interview.subscribeWord} />

          {preparingFollowUp && (
            <div className="followup-wait" role="status">
              <p className="inline-note">The interviewer is reading your answer…</p>
              <button className="secondary-btn" onClick={interview.skipFollowUp}>Skip follow-up</button>
            </div>
          )}

          {!busy && <p className="question-text">{interview.currentQuestion}</p>}

          {!busy && !isRetry && interview.sessionNote && (
            <p className="inline-note">{interview.sessionNote}</p>
          )}

          {!interview.ttsSupported && !busy && (
            <p className="inline-note">This browser can't read questions aloud, so they're shown on screen only.</p>
          )}

          {!busy && inputMode === "voice" && isListening && (
            <div className="listening-panel">
              <LiveTranscript subscribe={interview.subscribeTranscript} getSnapshot={interview.getTranscript} />
              <button className="finish-btn" onClick={interview.finishAnswer}>
                ✓ I'm done — submit answer
              </button>
            </div>
          )}

          {!busy && inputMode === "text" && (
            <TypingPanel
              key={`${isRetry ? "retry" : "q"}-${interview.questionIndex}-${interview.retryQuestionNumber}-${isFollowUp ? "f" : "m"}`}
              onSubmit={interview.submitTyped}
            />
          )}

          {error && (
            <div className="error-panel" role="alert">
              <p>{error}</p>
              <div className="error-actions">
                <button className="secondary-btn" onClick={interview.retry}>
                  {scoring ? "Retry scoring" : "Retry this question"}
                </button>
                {!scoring && inputMode === "voice" && (
                  <button className="secondary-btn" onClick={interview.switchToText}>Type instead</button>
                )}
                {scoring && interview.sessionMode === "full" && (
                  <button className="secondary-btn" onClick={interview.scoreWithPractice}>
                    Score with Practice Mode
                  </button>
                )}
                {scoring && isRetry && (
                  <button className="secondary-btn" onClick={interview.cancelRetry}>Cancel retry</button>
                )}
              </div>
            </div>
          )}

          {!busy && (
            <div className="interview-controls">
              <button className="secondary-btn" onClick={interview.replay} disabled={!interview.ttsSupported}>
                Replay question
              </button>
              {inputMode === "voice" && (
                <button className="secondary-btn" onClick={interview.reRecord} disabled={!isListening}>
                  Re-record
                </button>
              )}
              {!isRetry && (
                <button className="secondary-btn" onClick={interview.skip}>
                  {isFollowUp ? "Skip follow-up" : "Skip"}
                </button>
              )}
              {inputMode === "voice" ? (
                <button className="secondary-btn" onClick={interview.switchToText}>Type instead</button>
              ) : (
                interview.voiceOk && <button className="secondary-btn" onClick={interview.switchToVoice}>Use voice</button>
              )}
              {isRetry ? (
                <button className="secondary-btn secondary-btn--danger" onClick={interview.cancelRetry}>
                  Cancel retry
                </button>
              ) : (
                <button className="secondary-btn secondary-btn--danger" onClick={interview.endEarly}>
                  {interview.answeredCount > 0 ? "End & score" : "Quit"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------- summary ----------
  return (
    <div className="page">
      <Header onHistory={() => setScreen("history")} />
      <div className="summary-shell">
        <div className="summary-heading-row">
          <h1>Session summary</h1>
          <span className={`mode-badge ${summary.sessionMode === "full" ? "mode-badge--full" : ""}`}>
            {summary.sessionMode === "full" ? "Full AI Mode" : "Practice Mode"}
          </span>
        </div>

        {summary.overallSummary && (
          <p className="hero-sub" style={{ margin: "0 0 1.75rem", textAlign: "left" }}>{summary.overallSummary}</p>
        )}

        {summary.sessionMode === "full" && summary.usage && (
          <p className="usage-note" role="status">
            {summary.usage.remaining === 0
              ? `That was your last AI evaluation for today (${summary.usage.limit} per day). Practice Mode is still unlimited.`
              : `${summary.usage.remaining} of ${summary.usage.limit} AI evaluations left today. Resets at midnight UTC.`}
          </p>
        )}

        <RetryCard
          session={summary.session}
          weakestIndex={summary.weakestIndex}
          usesAi={summary.retryUsesAi}
          onRetry={summary.startRetry}
        />

        <SessionReview
          session={summary.session}
          retries={summary.retryResults}
          sessionMode={summary.sessionMode}
        />

        <div className="save-status" role="status">
          {summary.saveStatus === "saving" && <span>Saving to your history…</span>}
          {summary.saveStatus === "saved" && <span>Saved to your history.</span>}
          {summary.saveStatus === "skipped" && (
            <span>Private session: this one wasn't saved to your history. Export it as a PDF if you want to keep it.</span>
          )}
          {summary.saveStatus === "error" && (
            <>
              <span>Couldn't save this session to your history.</span>
              <button className="secondary-btn" onClick={summary.retrySave}>Retry save</button>
            </>
          )}
        </div>

        <div className="summary-actions">
          <button className="primary-btn" onClick={summary.restart}>Practice again</button>
          <button className="secondary-btn" onClick={() => setScreen("history")}>View history</button>
          <ExportPdfButton
            meta={summary.meta}
            overallSummary={summary.overallSummary}
            session={summary.session}
            retries={summary.retryResults}
          />
        </div>
      </div>
    </div>
  )
}