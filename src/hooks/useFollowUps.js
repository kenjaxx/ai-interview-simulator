import { useState, useRef, useCallback } from "react"
import { generateFollowUp } from "../lib/gemini"
import {
  MAX_FOLLOW_UPS,
  FOLLOW_UP_EVERY,
  MIN_FOLLOW_UP_WORDS,
  FOLLOW_UP_MIN_QUOTA,
} from "../lib/interviewConfig"

// AI follow-up questions (Full AI Mode only). Owns the "is this a follow-up" state and the rules for
// when one is worth asking.
export function useFollowUps({ interviewIdRef, quotaRef, applyUsage }) {
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [preparingFollowUp, setPreparingFollowUp] = useState(false)

  const isFollowUpRef = useRef(false)
  const usedRef = useRef(0) // follow-ups asked in this interview
  const runRef = useRef(0) // bumped to ignore a follow-up response that arrives late

  const clearFollowUp = useCallback(() => {
    isFollowUpRef.current = false
    setIsFollowUp(false)
    setPreparingFollowUp(false)
  }, [])

  // New interview (or restart): forget the count and ignore anything still in flight.
  const resetFollowUps = useCallback(() => {
    usedRef.current = 0
    runRef.current++
  }, [])

  // Ignore a follow-up that is still being generated.
  const cancelPending = useCallback(() => {
    runRef.current++
  }, [])

  // Should the AI probe this answer? Only in Full AI Mode, only on a main question, spread out
  // through the interview, capped, only for substantial answers, and only with quota to spare.
  const canAskFollowUp = useCallback(
    ({ config, answer, questionIndex, wasFollowUp }) => {
      const wordCount = answer.trim().split(/\s+/).filter(Boolean).length
      const q = quotaRef.current
      return (
        !wasFollowUp &&
        config.followUps &&
        config.mode === "full" &&
        usedRef.current < MAX_FOLLOW_UPS &&
        (questionIndex + 1) % FOLLOW_UP_EVERY === 0 &&
        wordCount >= MIN_FOLLOW_UP_WORDS &&
        !(q && (q.remaining < FOLLOW_UP_MIN_QUOTA || q.globalExhausted))
      )
    },
    [quotaRef]
  )

  // Generates and presents a follow-up. Resolves to:
  //   "presented" - the follow-up is now being asked
  //   "stale"     - the user restarted or skipped while we waited: do nothing
  //   "failed"    - generation failed: the caller should just carry on to the next question
  const askFollowUp = useCallback(
    async ({ config, question, answer, onThinking, present }) => {
      const interviewId = interviewIdRef.current
      const runId = ++runRef.current
      const isStale = () => interviewIdRef.current !== interviewId || runRef.current !== runId

      setPreparingFollowUp(true)
      onThinking()

      try {
        const result = await generateFollowUp({
          role: config.role,
          seniority: config.seniority,
          question,
          answer,
        })
        if (isStale()) return "stale"

        applyUsage(result.usage)
        usedRef.current++
        isFollowUpRef.current = true
        setIsFollowUp(true)
        setPreparingFollowUp(false)
        present(result.question)
        return "presented"
      } catch (err) {
        if (isStale()) return "stale"
        // A failed follow-up is never worth interrupting the interview.
        console.error("Couldn't generate a follow-up:", err)
        return "failed"
      }
    },
    [interviewIdRef, applyUsage]
  )

  return {
    isFollowUp,
    preparingFollowUp,
    isFollowUpRef,
    clearFollowUp,
    resetFollowUps,
    cancelPending,
    canAskFollowUp,
    askFollowUp,
  }
}
