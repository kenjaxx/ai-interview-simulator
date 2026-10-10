import { useState, useRef, useCallback, useEffect, useMemo } from "react"

import { ROLES } from "../lib/Options"
import { countFillers } from "../lib/fillers"
import { pickQuestions, getRecentQuestions, rememberQuestions } from "../lib/questions"
import { evaluateSession, generateQuestions } from "../lib/gemini"
import { findWeakestIndex } from "../lib/scores"
import { messageForError } from "../lib/Errormessages"
import { MIN_JD_CHARS } from "../lib/limits"
import { QUESTION_COUNT, JD_QUESTION_COUNT, MAX_FOLLOW_UPS } from "../lib/interviewConfig"

import { useSetupForm } from "./useSetupForm"
import { useQuota } from "./useQuota"
import { useSpeechIO } from "./useSpeechIO"
import { useSessionSave } from "./useSessionSave"
import { useFollowUps } from "./useFollowUps"
import { useRetryFlow } from "./useRetryFlow"

// Runs an interview: the question loop and final scoring. Everything else is delegated:
//   useSetupForm    what the user picked on the setup screen
//   useQuota        daily AI allowance
//   useSpeechIO     speech recognition, text-to-speech, mic
//   useSessionSave  saving the finished session
//   useFollowUps    AI follow-up questions
//   useRetryFlow    re-answering the weakest answer
// App and the screen components only render what this returns.
//
// Returns { screen, setScreen, setup, interview, summary }.
export function useInterview({ user, authLoading }) {
  const uid = user?.uid

  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary" | "history"
  const [notice, setNotice] = useState(null)
  const [starting, setStarting] = useState(false) // true while tailored questions are being generated
  const [sessionNote, setSessionNote] = useState(null) // shown during the interview (e.g. "3 questions are tailored...")

  const [orbState, setOrbState] = useState("idle") // "idle" | "listening" | "thinking" | "speaking"
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionTotal, setQuestionTotal] = useState(QUESTION_COUNT)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [inputMode, setInputMode] = useState("voice") // how the interview in progress is answered
  const [session, setSession] = useState([])
  const [sessionMeta, setSessionMeta] = useState(null) // { role, seniority, mode, date } for the PDF export
  const [overallSummary, setOverallSummary] = useState("")
  const [error, setError] = useState(null)
  // True while a score is being computed (the whole interview, or a retried answer).
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)
  // { remaining, limit } from the last Full AI evaluation, or null (Practice Mode / not yet scored).
  const [usage, setUsage] = useState(null)
  // Locked in when the interview starts, so toggling the switch mid-interview
  // never changes how the session already in progress gets scored.
  const [sessionMode, setSessionMode] = useState("practice")

  const promptShownAtRef = useRef(null)
  const questionsRef = useRef([])
  const questionIndexRef = useRef(0)
  const currentQuestionRef = useRef("")
  const qasRef = useRef([])
  const inputModeRef = useRef("voice")
  // Role, seniority, mode, privacy and follow-up choices are locked in at startInterview() and read
  // from here later. This is what keeps scoring from using stale values from an old render.
  const sessionConfigRef = useRef({
    role: ROLES[0],
    seniority: "Mid-level",
    mode: "practice",
    save: true,
    followUps: false,
  })
  // Bumped whenever an interview starts or is torn down, so late async results
  // (e.g. a scoring response arriving after sign-out) can be recognized as stale and dropped.
  const interviewIdRef = useRef(0)
  // Always points at the right answer handler (main flow or retry flow). Speech callbacks call
  // through this ref, which breaks the presentQuestion <-> handleAnswer dependency cycle without
  // stale closures.
  const answerRouterRef = useRef(() => {})

  // ---------- the focused hooks ----------

  const form = useSetupForm()
  const {
    quota,
    quotaRef,
    quotaStatus,
    quotaExhausted,
    effectiveMode,
    jdAvailable,
    followUpsAvailable,
    applyUsage,
    refreshQuota,
    resetQuota,
  } = useQuota({ uid, screen, aiMode: form.aiMode })

  const speech = useSpeechIO({
    speechLang: form.speechLang,
    ttsVoiceURI: form.ttsVoiceURI,
    ttsRate: form.ttsRate,
  })
  const { startListening, stopListening, speak, stopSpeaking, isSpeaking, acquireMic, releaseMic } = speech

  const { saveStatus, queueSave, markSkipped, resetSave, retrySave } = useSessionSave({ uid, interviewIdRef })

  const {
    isFollowUp,
    preparingFollowUp,
    isFollowUpRef,
    clearFollowUp,
    resetFollowUps,
    cancelPending,
    canAskFollowUp,
    askFollowUp,
  } = useFollowUps({ interviewIdRef, quotaRef, applyUsage })

  const setupMode = speech.voiceOk && form.inputPref === "voice" ? "voice" : "text"

  // ---------- speech callbacks ----------

  // User pressed "I'm done" (or the backstop fired) but nothing was captured.
  const handleEmptyAnswer = useCallback(() => {
    setOrbState("idle")
    setError(
      "We didn't catch any speech. Check that your microphone is working and try again, or type your answer instead."
    )
  }, [])

  // Mic blocked, recognition unsupported, or recognition kept failing.
  const handleListenError = useCallback((message) => {
    setOrbState("idle")
    setError(message)
  }, [])

  // Starts collecting an answer for the current question. In voice mode that means listening;
  // in text mode the textarea is already on screen, so there's nothing to start.
  const beginAnswering = useCallback(() => {
    // Response delay is measured from when the interviewer finishes speaking,
    // not from when the question started being read aloud.
    promptShownAtRef.current = Date.now()

    if (inputModeRef.current === "text") {
      setOrbState("idle")
      return
    }

    setOrbState("listening")
    startListening({
      promptShownAt: promptShownAtRef.current,
      lang: form.speechLang,
      onFinal: (answerText, metrics) => answerRouterRef.current(answerText, metrics, "voice"),
      onEmpty: handleEmptyAnswer,
      onError: handleListenError,
    })
  }, [startListening, form.speechLang, handleEmptyAnswer, handleListenError])

  const presentQuestion = useCallback(
    (question) => {
      // Stop listening first, otherwise the recognizer would transcribe the question being read aloud.
      stopListening()
      setCurrentQuestion(question)
      currentQuestionRef.current = question
      setOrbState("speaking")

      // Opens the mic on the first question (or retries if it failed earlier); no-op afterwards.
      // Not awaited: the level meter is cosmetic and must never block the interview.
      if (inputModeRef.current === "voice") acquireMic()

      speak(question, beginAnswering)
    },
    [stopListening, speak, acquireMic, beginAnswering]
  )

  const {
    retryIndex,
    retryResults,
    isRetryActive,
    resetRetry,
    runRetryScoring,
    handleRetryAnswer,
    startRetry,
    cancelRetry,
  } = useRetryFlow({
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
  })

  // ---------- flow ----------

  // Tears everything down: speech, recognition, mic stream, and any in-flight scoring.
  const restart = useCallback(() => {
    interviewIdRef.current++
    stopSpeaking()
    stopListening()
    releaseMic()
    resetFollowUps()
    resetRetry()
    resetSave()
    clearFollowUp()

    setScreen("setup")
    qasRef.current = []
    questionsRef.current = []
    questionIndexRef.current = 0
    setQuestionIndex(0)
    setAnsweredCount(0)
    setSession([])
    setSessionMeta(null)
    setOverallSummary("")
    setUsage(null)
    setCurrentQuestion("")
    currentQuestionRef.current = ""
    setOrbState("idle")
    setError(null)
    setNotice(null)
    setSessionNote(null)
    setStarting(false)
    setAwaitingFinalScore(false)
  }, [stopSpeaking, stopListening, releaseMic, resetFollowUps, resetRetry, resetSave, clearFollowUp])

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
    [releaseMic, queueSave, markSkipped, applyUsage]
  )

  // Called when the last question is done, or the user ends early.
  const finishInterview = useCallback(() => {
    if (qasRef.current.length === 0) {
      restart()
      setNotice(
        "You didn't answer any questions, so there was nothing to score. Start again whenever you're ready."
      )
      return
    }
    runFinalScoring()
  }, [restart, runFinalScoring])

  // Moves on to the next MAIN question, or finishes if that was the last one.
  // Always leaves any follow-up state behind.
  const advance = useCallback(() => {
    clearFollowUp()
    const next = questionIndexRef.current + 1
    if (next >= questionsRef.current.length) {
      finishInterview()
      return
    }
    questionIndexRef.current = next
    setQuestionIndex(next)
    presentQuestion(questionsRef.current[next])
  }, [clearFollowUp, finishInterview, presentQuestion])

  const handleAnswer = useCallback(
    async (answerText, metrics, inputMethod = "voice") => {
      setError(null)

      const wasFollowUp = isFollowUpRef.current
      const question = currentQuestionRef.current
      const updated = [
        ...qasRef.current,
        { question, answer: answerText, metrics, inputMethod, isFollowUp: wasFollowUp },
      ]
      qasRef.current = updated
      setAnsweredCount(updated.length)

      const config = sessionConfigRef.current
      if (
        canAskFollowUp({ config, answer: answerText, questionIndex: questionIndexRef.current, wasFollowUp })
      ) {
        const outcome = await askFollowUp({
          config,
          question,
          answer: answerText,
          onThinking: () => setOrbState("thinking"),
          present: presentQuestion,
        })
        // "presented": the follow-up is being asked. "stale": the user left or skipped. Either way, stop here.
        if (outcome !== "failed") return
      }

      advance()
    },
    [isFollowUpRef, canAskFollowUp, askFollowUp, presentQuestion, advance]
  )

  // Gives up waiting for a follow-up and moves on.
  const skipFollowUp = () => {
    cancelPending()
    advance()
  }

  useEffect(() => {
    answerRouterRef.current = (answerText, metrics, inputMethod) => {
      if (isRetryActive()) handleRetryAnswer(answerText, metrics, inputMethod)
      else handleAnswer(answerText, metrics, inputMethod)
    }
  }, [handleAnswer, handleRetryAnswer, isRetryActive])

  // ---------- starting an interview ----------

  const startInterview = async () => {
    if (starting) return

    // Capture the setup choices now: the user could touch the form while questions are generated.
    const mode = effectiveMode
    const chosenRole = form.role
    const chosenSeniority = form.seniority
    const jd = form.jobDescription.trim()
    const useJd = jdAvailable && jd.length >= MIN_JD_CHARS
    const save = form.saveHistory
    const useFollowUps = form.followUps && followUpsAvailable

    const interviewId = ++interviewIdRef.current
    setNotice(null)

    let custom = []
    let note = null
    if (useJd) {
      setStarting(true)
      try {
        const result = await generateQuestions({
          role: chosenRole,
          seniority: chosenSeniority,
          jobDescription: jd,
          count: JD_QUESTION_COUNT,
        })
        custom = result.questions
        applyUsage(result.usage)
        note = `${custom.length} of these questions are tailored to the job description you pasted.`
      } catch (err) {
        console.error("Couldn't generate tailored questions:", err)
        note = "Couldn't generate job-specific questions, so a standard set was used."
      } finally {
        setStarting(false)
      }
      // The user signed out or restarted while we were waiting.
      if (interviewIdRef.current !== interviewId) return
    }

    sessionConfigRef.current = {
      role: chosenRole,
      seniority: chosenSeniority,
      mode,
      save,
      followUps: useFollowUps && mode === "full",
    }
    inputModeRef.current = setupMode
    qasRef.current = []
    resetRetry()
    resetFollowUps()
    resetSave()

    const questions = pickQuestions(chosenRole, chosenSeniority, QUESTION_COUNT, {
      recent: getRecentQuestions(),
      custom,
    })
    rememberQuestions(questions.filter((q) => !custom.includes(q)))
    questionsRef.current = questions
    questionIndexRef.current = 0

    setInputMode(setupMode)
    setSessionMode(mode)
    setQuestionIndex(0)
    setQuestionTotal(questions.length)
    setAnsweredCount(0)
    setSession([])
    setSessionMeta(null)
    setOverallSummary("")
    setUsage(null)
    setError(null)
    setNotice(null)
    setSessionNote(note)
    setAwaitingFinalScore(false)
    clearFollowUp()
    setScreen("interview")

    presentQuestion(questions[0])
  }

  // ---------- interview controls ----------

  const retry = () => {
    setError(null)
    if (awaitingFinalScore) {
      if (isRetryActive()) runRetryScoring()
      else runFinalScoring()
    } else {
      presentQuestion(currentQuestionRef.current)
    }
  }

  // Reads the question again. Any answer in progress is discarded, since the mic has to be off while it speaks.
  const replay = () => {
    setError(null)
    presentQuestion(currentQuestionRef.current)
  }

  // Throws away what was said so far and starts listening again, without re-reading the question.
  const reRecord = () => {
    setError(null)
    stopSpeaking()
    beginAnswering()
  }

  // Skips the current question (or the current follow-up) and moves on to the next main question.
  const skip = () => {
    stopSpeaking()
    stopListening()
    setError(null)
    advance()
  }

  const endEarly = () => {
    stopSpeaking()
    stopListening()
    setError(null)
    cancelPending()
    clearFollowUp()
    finishInterview()
  }

  const switchToText = () => {
    stopListening()
    releaseMic()
    inputModeRef.current = "text"
    setInputMode("text")
    setError(null)
    promptShownAtRef.current = Date.now()
    // If the question is still being read, the orb keeps its speaking state until it finishes.
    if (!isSpeaking) setOrbState("idle")
  }

  const switchToVoice = () => {
    inputModeRef.current = "voice"
    setInputMode("voice")
    setError(null)
    acquireMic()
    // If the question is still being read, listening starts when it finishes.
    if (!isSpeaking) beginAnswering()
  }

  // The typed text itself lives in the TypingPanel component, so keystrokes don't re-render the app.
  const submitTyped = (rawText) => {
    const text = rawText.trim()
    if (!text) return
    stopSpeaking()
    // Typed answers have no pace or response delay, so those are left at 0 and flagged via inputMethod.
    answerRouterRef.current(text, { wpm: 0, fillerCount: countFillers(text), responseDelaySec: 0 }, "text")
  }

  const scoreWithPractice = () => {
    if (isRetryActive()) runRetryScoring("practice")
    else runFinalScoring("practice")
  }

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) {
      restart()
      resetQuota()
    }
  }, [user, authLoading, restart, resetQuota])

  // The weakest answer that hasn't been retried yet (-1 when there's nothing left to retry).
  const weakestIndex = useMemo(
    () => findWeakestIndex(session, new Set(Object.keys(retryResults).map(Number))),
    [session, retryResults]
  )

  return {
    screen,
    setScreen,

    setup: {
      role: form.role,
      setRole: form.setRole,
      seniority: form.seniority,
      setSeniority: form.setSeniority,
      aiMode: effectiveMode,
      setAiMode: form.setAiMode,
      quota,
      quotaStatus,
      quotaExhausted,
      refreshQuota,
      jobDescription: form.jobDescription,
      setJobDescription: form.setJobDescription,
      jdAvailable,
      followUps: form.followUps,
      setFollowUps: form.setFollowUps,
      followUpsAvailable,
      saveHistory: form.saveHistory,
      setSaveHistory: form.setSaveHistory,
      speechLang: form.speechLang,
      selectAccent: form.selectAccent,
      ttsVoiceURI: form.ttsVoiceURI,
      setTtsVoiceURI: form.setTtsVoiceURI,
      ttsRate: form.ttsRate,
      setTtsRate: form.setTtsRate,
      voices: speech.voices,
      previewAccent: speech.previewAccent,
      previewVoice: speech.previewVoice,
      stopPreview: speech.stopPreview,
      starting,
      setupMode,
      setInputPref: form.setInputPref,
      support: speech.support,
      mic: speech.mic,
      notice,
      questionCount: QUESTION_COUNT,
      maxFollowUps: MAX_FOLLOW_UPS,
      start: startInterview,
    },

    interview: {
      orbState,
      currentQuestion,
      questionIndex,
      questionTotal,
      answeredCount,
      inputMode,
      error,
      awaitingFinalScore,
      sessionMode,
      sessionNote,
      isFollowUp,
      preparingFollowUp,
      skipFollowUp,
      isRetry: retryIndex !== null,
      retryQuestionNumber: retryIndex !== null ? retryIndex + 1 : null,
      voiceOk: speech.voiceOk,
      ttsSupported: speech.ttsSupported,
      isListening: speech.isListening,
      getLevel: speech.getLevel,
      subscribeWord: speech.subscribeWord,
      subscribeTranscript: speech.subscribeTranscript,
      getTranscript: speech.getTranscript,
      finishAnswer: speech.finishAnswer,
      submitTyped,
      retry,
      replay,
      reRecord,
      skip,
      endEarly,
      cancelRetry,
      switchToText,
      switchToVoice,
      scoreWithPractice,
    },

    summary: {
      session,
      meta: sessionMeta,
      overallSummary,
      sessionMode,
      usage,
      saveStatus,
      retrySave,
      restart,
      retryResults,
      weakestIndex,
      startRetry,
      retryUsesAi: sessionMode === "full" && !quotaExhausted,
    },
  }
}
