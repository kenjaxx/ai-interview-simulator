import { useState, useRef, useCallback } from "react"
import { evaluateSession } from "../lib/gemini"
import { messageForError } from "../lib/Errormessages"

// Re-answering one weak answer. The retry is scored on its own: the original session (and its saved
// history entry) is left untouched, and the result is shown next to it for comparison.
//
// The interview hook owns the shared screen state, so it hands the pieces this flow needs.
export function useRetryFlow({
  sessionConfigRef,
  interviewIdRef,
  qasRef,
  currentQuestionRef,
  inputModeRef,
  setupMode,
  quotaExhausted,
  applyUsage,
  releaseMic,
  stopSpeaking,
  stopListening,
  presentQuestion,
  clearFollowUp,
  setScreen,
  setOrbState,
  setError,
  setAwaitingFinalScore,
  setInputMode,
}) {
  const [retryIndex, setRetryIndex] = useState(null) // which answer is being re-answered
  const [retryResults, setRetryResults] = useState({}) // index -> { answer, inputMethod, metrics, evaluation, mode }

  const retryRunRef = useRef(0) // bumped when a retry starts or is cancelled
  const retryIndexRef = useRef(null)
  const retryAttemptRef = useRef(null) // { question, answer, metrics, inputMethod } waiting to be scored
  const retryModeRef = useRef("practice") // "practice" | "full" for the retry in progress

  // True while a retry is in progress. A function (not a value) so it always reads the live ref.
  const isRetryActive = useCallback(() => retryIndexRef.current !== null, [])

  // Clears everything about retries (new interview, restart).
  const resetRetry = useCallback(() => {
    retryRunRef.current++
    retryIndexRef.current = null
    retryAttemptRef.current = null
    setRetryIndex(null)
    setRetryResults({})
  }, [])

  const runRetryScoring = useCallback(
    async (forceMode) => {
      const index = retryIndexRef.current
      const attempt = retryAttemptRef.current
      if (index === null || !attempt) return

      const runId = retryRunRef.current
      const interviewId = interviewIdRef.current
      const config = sessionConfigRef.current
      const mode = forceMode || retryModeRef.current
      if (forceMode) retryModeRef.current = forceMode

      releaseMic()
      setAwaitingFinalScore(true)
      setOrbState("thinking")
      setError(null)

      try {
        const { evaluations, usage: usageInfo } = await evaluateSession({
          role: config.role,
          seniority: config.seniority,
          qas: [attempt],
          mock: mode === "practice",
        })

        if (interviewIdRef.current !== interviewId || retryRunRef.current !== runId) return

        if (mode === "full") applyUsage(usageInfo)
        setRetryResults((prev) => ({
          ...prev,
          [index]: {
            answer: attempt.answer,
            inputMethod: attempt.inputMethod,
            metrics: attempt.metrics,
            evaluation: evaluations[0],
            mode,
          },
        }))
        retryIndexRef.current = null
        retryAttemptRef.current = null
        setRetryIndex(null)
        setAwaitingFinalScore(false)
        setOrbState("idle")
        setScreen("summary")
      } catch (err) {
        if (interviewIdRef.current !== interviewId || retryRunRef.current !== runId) return
        console.error("Failed to score the retry:", err)
        setError(messageForError(err))
        setOrbState("idle")
      }
    },
    [
      interviewIdRef,
      sessionConfigRef,
      releaseMic,
      applyUsage,
      setAwaitingFinalScore,
      setOrbState,
      setError,
      setScreen,
    ]
  )

  const handleRetryAnswer = useCallback(
    (answerText, metrics, inputMethod = "voice") => {
      setError(null)
      retryAttemptRef.current = {
        question: currentQuestionRef.current,
        answer: answerText,
        metrics,
        inputMethod,
      }
      runRetryScoring()
    },
    [setError, currentQuestionRef, runRetryScoring]
  )

  const startRetry = (index) => {
    const qa = qasRef.current[index]
    if (!qa) return

    const baseMode = sessionConfigRef.current.mode
    // If the AI quota ran out since the interview, score the retry locally instead of failing.
    retryModeRef.current = baseMode === "full" && quotaExhausted ? "practice" : baseMode

    retryRunRef.current++
    retryIndexRef.current = index
    retryAttemptRef.current = null
    inputModeRef.current = setupMode
    clearFollowUp()

    setRetryIndex(index)
    setInputMode(setupMode)
    setAwaitingFinalScore(false)
    setError(null)
    setScreen("interview")

    presentQuestion(qa.question)
  }

  const cancelRetry = () => {
    retryRunRef.current++
    stopSpeaking()
    stopListening()
    releaseMic()
    retryIndexRef.current = null
    retryAttemptRef.current = null
    setRetryIndex(null)
    setAwaitingFinalScore(false)
    setOrbState("idle")
    setError(null)
    setScreen("summary")
  }

  return {
    retryIndex,
    retryResults,
    isRetryActive,
    resetRetry,
    runRetryScoring,
    handleRetryAnswer,
    startRetry,
    cancelRetry,
  }
}
