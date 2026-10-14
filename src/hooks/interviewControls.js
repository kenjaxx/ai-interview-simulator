import { countFillers } from "../lib/fillers"

// The handlers behind the buttons on the interview screen. Not a hook: it returns plain functions
// that close over the current render's values, like the handlers they replace.
export function createInterviewControls(d) {
  // Retries whatever just failed: scoring, or presenting the current question.
  const retry = () => {
    d.setError(null)
    if (d.awaitingFinalScore) {
      if (d.isRetryActive()) d.runRetryScoring()
      else d.runFinalScoring()
    } else {
      d.presentQuestion(d.currentQuestionRef.current)
    }
  }

  // Reads the question again. Any answer in progress is discarded, since the mic has to be off while it speaks.
  const replay = () => {
    d.setError(null)
    d.presentQuestion(d.currentQuestionRef.current)
  }

  // Throws away what was said so far (or the transcript being reviewed) and starts listening
  // again, without re-reading the question. beginAnswering also clears any review draft.
  const reRecord = () => {
    d.setError(null)
    d.stopSpeaking()
    d.beginAnswering()
  }

  // Skips the current question (or the current follow-up) and moves on to the next main question.
  const skip = () => {
    d.stopSpeaking()
    d.stopListening()
    d.setReviewDraft(null)
    d.setError(null)
    d.advance()
  }

  // Gives up waiting for a follow-up and moves on.
  const skipFollowUp = () => {
    d.cancelPending()
    d.advance()
  }

  const endEarly = () => {
    d.stopSpeaking()
    d.stopListening()
    d.setReviewDraft(null)
    d.setError(null)
    d.cancelPending()
    d.clearFollowUp()
    d.finishInterview()
  }

  const switchToText = () => {
    d.stopListening()
    d.releaseMic()
    d.setReviewDraft(null)
    d.inputModeRef.current = "text"
    d.setInputMode("text")
    d.setError(null)
    d.promptShownAtRef.current = Date.now()
    // If the question is still being read, the orb keeps its speaking state until it finishes.
    if (!d.isSpeaking) d.setOrbState("idle")
  }

  const switchToVoice = () => {
    d.inputModeRef.current = "voice"
    d.setInputMode("voice")
    d.setError(null)
    d.acquireMic()
    // If the question is still being read, listening starts when it finishes.
    if (!d.isSpeaking) d.beginAnswering()
  }

  // The typed text itself lives in the TypingPanel component, so keystrokes don't re-render the app.
  const submitTyped = (rawText) => {
    const text = rawText.trim()
    if (!text) return
    d.stopSpeaking()
    // Typed answers have no pace or response delay, so those are left at 0 and flagged via inputMethod.
    d.answerRouterRef.current(text, { wpm: 0, fillerCount: countFillers(text), responseDelaySec: 0 }, "text")
  }

  // Sends a reviewed voice answer on to scoring. The text may have been edited, but the speech
  // metrics (pace, fillers, delay) stay exactly as they were measured from the voice, so editing
  // the transcript can't be used to change them. The text itself still counts as a voice answer.
  // The edited text lives in the TranscriptReview component, so keystrokes don't re-render the app.
  const submitReview = (rawText) => {
    const draft = d.reviewDraft
    const text = rawText.trim()
    if (!draft || !text) return
    d.setReviewDraft(null)
    d.answerRouterRef.current(text, draft.metrics, "voice")
  }

  const scoreWithPractice = () => {
    if (d.isRetryActive()) d.runRetryScoring("practice")
    else d.runFinalScoring("practice")
  }

  return {
    retry,
    replay,
    reRecord,
    skip,
    skipFollowUp,
    endEarly,
    switchToText,
    switchToVoice,
    submitTyped,
    submitReview,
    scoreWithPractice,
  }
}