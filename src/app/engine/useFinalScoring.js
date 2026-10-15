import { useCallback } from "react"
import { evaluateSession } from "../../lib/gemini"
import { messageForError } from "../../lib/errorMessages"

// Scores the finished interview (Full AI Mode through the server, Practice Mode locally), then
// moves to the summary and queues the save. The interview hook owns the shared state, so it hands
// over the pieces this needs.
export function useFinalScoring({
  sessionConfigRef,
  interviewIdRef,
  qasRef,
  releaseMic,
  queueSave,
  markSkipped,
  applyUsage,
  setSessionMode,
  setAwaitingFinalScore,
  setOrbState,
  setError,
  setSession,
  setSessionMeta,
  setOverallSummary,
  setUsage,
  setScreen,
}) {
  // forceMode lets the user re-score a finished interview locally when the AI is unavailable.
  const runFinalScoring = useCallback(
    async (forceMode) => {
      const interviewId = interviewIdRef.current
      const config = sessionConfigRef.current
      const mode = forceMode || config.mode
      if (mode !== config.mode) {
        sessionConfigRef.current = { ...config, mode }
        setSessionMode(mode)
      }

      // All answers are in, so the interview is over: release the mic now.
      releaseMic()

      setAwaitingFinalScore(true)
      setOrbState("thinking")
      setError(null)

      try {
        const {
          evaluations,
          overallSummary: summaryText,
          usage: usageInfo,
        } = await evaluateSession({
          role: config.role,
          seniority: config.seniority,
          qas: qasRef.current,
          mock: mode === "practice",
        })

        // The user left (signed out / restarted) while we were waiting - drop the result.
        if (interviewIdRef.current !== interviewId) return

        const finalSession = qasRef.current.map((qa, i) => ({
          question: qa.question,
          answer: qa.answer,
          inputMethod: qa.inputMethod,
          isFollowUp: !!qa.isFollowUp,
          metrics: qa.metrics,
          evaluation: evaluations[i],
        }))

        setSession(finalSession)
        setSessionMeta({ role: config.role, seniority: config.seniority, mode, date: new Date() })
        setOverallSummary(summaryText || "")
        setUsage(mode === "full" ? usageInfo : null)
        if (mode === "full") applyUsage(usageInfo)
        setScreen("summary")
        setOrbState("idle")
        setAwaitingFinalScore(false)

        if (config.save) {
          queueSave(
            {
              role: config.role,
              seniority: config.seniority,
              mode,
              overallSummary: summaryText || "",
              session: finalSession,
            },
            interviewId
          )
        } else {
          markSkipped()
        }
      } catch (err) {
        if (interviewIdRef.current !== interviewId) return
        console.error("Failed to score the session:", err)
        setError(messageForError(err))
        setOrbState("idle")
      }
    },
    [
      interviewIdRef,
      sessionConfigRef,
      qasRef,
      releaseMic,
      queueSave,
      markSkipped,
      applyUsage,
      setSessionMode,
      setAwaitingFinalScore,
      setOrbState,
      setError,
      setSession,
      setSessionMeta,
      setOverallSummary,
      setUsage,
      setScreen,
    ]
  )

  return { runFinalScoring }
}