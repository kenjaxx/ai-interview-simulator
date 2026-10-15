import Orb from "./components/Orb"
import Header from "../../common/components/Header"
import LiveTranscript from "./components/LiveTranscript"
import TypingPanel from "./components/TypingPanel"
import TranscriptReview from "./components/TranscriptReview"
import AnswerTimer from "./components/AnswerTimer"
import DoneShortcut from "./components/DoneShortcut"
import InterviewProgress from "./components/InterviewProgress"
import InterviewControls from "./components/InterviewControls"
import { MAX_ANSWER_CHARS } from "../../lib/limits"
import "./interview.fit.css"
// Also used for retrying a single answer.
// interview: the `interview` object from useInterview().
export default function InterviewScreen({ interview }) {
  const {
    isRetry,
    awaitingFinalScore: scoring,
    inputMode,
    isListening,
    error,
    isFollowUp,
    preparingFollowUp,
    reviewDraft,
  } = interview
  const busy = scoring || preparingFollowUp
  const reviewing = !!reviewDraft

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

  // Changes for every new question, so the timer and the typing box start fresh.
  const questionKey = `${isRetry ? "retry" : "q"}-${interview.questionIndex}-${interview.retryQuestionNumber}-${isFollowUp ? "f" : "m"}`

  return (
    <div className="page page--interview">
      <Header />
      <div className="interview-shell">
        <p className="progress-label" tabIndex={-1} data-screen-heading aria-live="polite">
          {progress}
        </p>

        {!isRetry && (
          <InterviewProgress current={interview.questionIndex} total={interview.questionTotal} done={scoring} />
        )}

        <Orb
          state={interview.orbState}
          getLevel={interview.getLevel}
          subscribeWord={interview.subscribeWord}
        />

        {preparingFollowUp && (
          <div className="followup-wait" role="status">
            <p className="inline-note">The interviewer is reading your answer…</p>
            <button className="secondary-btn" onClick={interview.skipFollowUp}>
              Skip follow-up
            </button>
          </div>
        )}

        {!busy && (
          <p className="question-text" id="current-question">
            {interview.currentQuestion}
          </p>
        )}

        {!busy && !isRetry && interview.sessionNote && <p className="inline-note">{interview.sessionNote}</p>}

        {!interview.ttsSupported && !busy && (
          <p className="inline-note">
            This browser can't read questions aloud, so they're shown on screen only.
          </p>
        )}

        {!busy && inputMode === "voice" && isListening && (
          <div className="listening-panel">
            <LiveTranscript subscribe={interview.subscribeTranscript} getSnapshot={interview.getTranscript} />
            <AnswerTimer key={questionKey} />
            <button className="finish-btn" onClick={interview.finishAnswer}>
              ✓ I'm done — review my answer
            </button>
            <p className="shortcut-hint">
              Or press <kbd>Space</kbd> or <kbd>Enter</kbd>
            </p>
            <DoneShortcut onDone={interview.finishAnswer} getTranscript={interview.getTranscript} />
          </div>
        )}

        {!busy && inputMode === "voice" && reviewing && (
          <TranscriptReview
            key={`review-${questionKey}`}
            initialText={reviewDraft.text}
            onSubmit={interview.submitReview}
            onRecordAgain={interview.reRecord}
            maxLength={MAX_ANSWER_CHARS}
            describedBy="current-question"
          />
        )}

        {!busy && inputMode === "text" && (
          <>
            <AnswerTimer key={`timer-${questionKey}`} />
            <TypingPanel
              key={questionKey}
              onSubmit={interview.submitTyped}
              maxLength={MAX_ANSWER_CHARS}
              describedBy="current-question"
            />
          </>
        )}

        {error && (
          <div className="error-panel" role="alert">
            <p>{error}</p>
            <div className="error-actions">
              <button className="secondary-btn" onClick={interview.retry}>
                {scoring ? "Retry scoring" : "Retry this question"}
              </button>
              {!scoring && inputMode === "voice" && (
                <button className="secondary-btn" onClick={interview.switchToText}>
                  Type instead
                </button>
              )}
              {scoring && interview.sessionMode === "full" && (
                <button className="secondary-btn" onClick={interview.scoreWithPractice}>
                  Score with Practice Mode
                </button>
              )}
              {scoring && isRetry && (
                <button className="secondary-btn" onClick={interview.cancelRetry}>
                  Cancel retry
                </button>
              )}
            </div>
          </div>
        )}

        {!busy && <InterviewControls interview={interview} />}
      </div>
    </div>
  )
}