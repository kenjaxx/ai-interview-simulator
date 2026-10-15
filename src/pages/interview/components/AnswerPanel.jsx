import LiveTranscript from "./LiveTranscript"
import TypingPanel from "./TypingPanel"
import TranscriptReview from "./TranscriptReview"
import AnswerTimer from "./AnswerTimer"
import DoneShortcut from "./DoneShortcut"
import { MAX_ANSWER_CHARS } from "../../../lib/limits"

// The right-hand panel: whatever you need to answer the current question.
//   voice, listening   the live transcript
//   voice, reviewing   the editable transcript
//   typing             the text box
//   busy               a short waiting message
// The "I'm done" button lives in the control dock; the Space / Enter shortcut is wired up here.
export default function AnswerPanel({ interview, progress, questionKey, busy }) {
  const {
    isRetry,
    awaitingFinalScore: scoring,
    inputMode,
    isListening,
    error,
    preparingFollowUp,
    reviewDraft,
  } = interview
  const reviewing = !!reviewDraft

  return (
    <section className="answer-panel" aria-label="Your answer">
      {/* ScreenFocus moves focus here when the screen opens. */}
      <p className="answer-head" tabIndex={-1} data-screen-heading aria-live="polite">
        {progress}
      </p>

      <div className="answer-body">
        {preparingFollowUp && (
          <div className="answer-wait" role="status">
            <p className="inline-note">The interviewer is reading your answer…</p>
            <button className="secondary-btn" onClick={interview.skipFollowUp}>
              Skip follow-up
            </button>
          </div>
        )}

        {scoring && !error && (
          <div className="answer-wait" role="status">
            <div className="page-loading-spinner" />
            <p className="inline-note">{isRetry ? "Scoring your retry…" : "Scoring your interview…"}</p>
          </div>
        )}

        {!busy && !isRetry && interview.sessionNote && <p className="inline-note">{interview.sessionNote}</p>}

        {!busy && !interview.ttsSupported && (
          <p className="inline-note">This browser can't read questions aloud, so they're shown on screen only.</p>
        )}

        {/* voice: waiting for the question to finish */}
        {!busy && inputMode === "voice" && !isListening && !reviewing && !error && (
          <p className="answer-hint">Your answer is recorded as soon as the question has been read.</p>
        )}

        {/* voice: listening */}
        {!busy && inputMode === "voice" && isListening && (
          <>
            <p className="answer-label">Live transcript</p>
            <div className="answer-live">
              <LiveTranscript subscribe={interview.subscribeTranscript} getSnapshot={interview.getTranscript} />
            </div>
            <div className="answer-foot">
              <AnswerTimer key={questionKey} />
              <p className="shortcut-hint">
                Or press <kbd>Space</kbd> or <kbd>Enter</kbd>
              </p>
            </div>
            <DoneShortcut onDone={interview.finishAnswer} getTranscript={interview.getTranscript} />
          </>
        )}

        {/* voice: check the transcript before it is scored */}
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

        {/* typing */}
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
      </div>
    </section>
  )
}