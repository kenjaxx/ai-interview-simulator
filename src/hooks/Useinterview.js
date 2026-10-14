import { useState, useRef, useCallback, useEffect, useMemo } from "react"

import { ROLES } from "../lib/Options"
import { findWeakestIndex } from "../lib/scores"
import { DEFAULT_QUESTION_COUNT } from "../lib/interviewConfig"

import { useSetupForm } from "./useSetupForm"
import { useQuota } from "./useQuota"
import { useSpeechIO } from "./useSpeechIO"
import { useSessionSave } from "./useSessionSave"
import { useFollowUps } from "./useFollowUps"
import { useRetryFlow } from "./useRetryFlow"
import { useFinalScoring } from "./useFinalScoring"
import { createStartInterview } from "./startInterview"
import { createInterviewControls } from "./interviewControls"
import { buildInterviewApi } from "./buildInterviewApi"

// Runs an interview: the question loop. Everything else is delegated:
//   useSetupForm        what the user picked on the setup screen
//   useQuota            daily AI allowance
//   useSpeechIO         speech recognition, text-to-speech, mic
//   useSessionSave      saving the finished session
//   useFollowUps        AI follow-up questions
//   useRetryFlow        re-answering the weakest answer
//   useFinalScoring     scoring the finished interview
//   startInterview.js   building the question list and starting
//   interviewControls.js  the buttons on the interview screen
//   buildInterviewApi.js  shaping what App and the screens receive
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
  const [questionTotal, setQuestionTotal] = useState(DEFAULT_QUESTION_COUNT)
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
  // A spoken answer waiting for the user to check it: { text, metrics }, or null.
  // The answer is only scored after the user confirms it (see submitReview in interviewControls.js).
  const [reviewDraft, setReviewDraft] = useState(null)

  const promptShownAtRef = useRef(null)
  const questionsRef = useRef([])
  const questionIndexRef = useRef(0)
  const currentQuestionRef = useRef("")
  const qasRef = useRef([])
  const inputModeRef = useRef("voice")
  // Role, seniority, mode, privacy and follow-up choices are locked in when the interview starts and
  // read from here later. This is what keeps scoring from using stale values from an old render.
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

  // User pressed "I'm done" and something was captured. Instead of scoring straight away, hold the
  // transcript (with its measured speech metrics) so the user can check and correct it first.
  const handleVoiceFinal = useCallback((answerText, metrics) => {
    setOrbState("idle")
    setReviewDraft({ text: answerText, metrics })
  }, [])

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
    // A new attempt replaces any transcript that was waiting for review.
    setReviewDraft(null)

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
      onFinal: handleVoiceFinal,
      onEmpty: handleEmptyAnswer,
      onError: handleListenError,
    })
  }, [startListening, form.speechLang, handleVoiceFinal, handleEmptyAnswer, handleListenError])

  const presentQuestion = useCallback(
    (question) => {
      // Stop listening first, otherwise the recognizer would transcribe the question being read aloud.
      stopListening()
      setReviewDraft(null)
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
    setReviewDraft(null)
  }, [stopSpeaking, stopListening, releaseMic, resetFollowUps, resetRetry, resetSave, clearFollowUp])

  // forceMode lets the user re-score a finished interview locally when the AI is unavailable.
  const { runFinalScoring } = useFinalScoring({
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
  })

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
    setReviewDraft(null)
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

  useEffect(() => {
    answerRouterRef.current = (answerText, metrics, inputMethod) => {
      if (isRetryActive()) handleRetryAnswer(answerText, metrics, inputMethod)
      else handleAnswer(answerText, metrics, inputMethod)
    }
  }, [handleAnswer, handleRetryAnswer, isRetryActive])

  // ---------- controls and starting ----------

  const controls = createInterviewControls({
    awaitingFinalScore,
    isSpeaking,
    reviewDraft,
    answerRouterRef,
    currentQuestionRef,
    inputModeRef,
    promptShownAtRef,
    isRetryActive,
    runRetryScoring,
    runFinalScoring,
    presentQuestion,
    beginAnswering,
    advance,
    finishInterview,
    cancelPending,
    clearFollowUp,
    stopSpeaking,
    stopListening,
    releaseMic,
    acquireMic,
    setError,
    setInputMode,
    setOrbState,
    setReviewDraft,
  })

  // Applies a freshly built question list: resets all per-interview state and asks question one.
  const beginSession = ({ config, questions, note, mode, inputMode: chosenInput }) => {
    sessionConfigRef.current = config
    inputModeRef.current = chosenInput
    qasRef.current = []
    resetRetry()
    resetFollowUps()
    resetSave()
    questionsRef.current = questions
    questionIndexRef.current = 0

    setInputMode(chosenInput)
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
    setReviewDraft(null)
    clearFollowUp()
    setScreen("interview")

    presentQuestion(questions[0])
  }

  const startInterview = createStartInterview({
    form,
    effectiveMode,
    jdAvailable,
    followUpsAvailable,
    setupMode,
    applyUsage,
    starting,
    setStarting,
    setNotice,
    interviewIdRef,
    beginSession,
  })

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

  return buildInterviewApi({
    screen,
    setScreen,
    uid,
    form,
    speech,
    quota,
    quotaStatus,
    quotaExhausted,
    effectiveMode,
    jdAvailable,
    followUpsAvailable,
    refreshQuota,
    starting,
    setupMode,
    notice,
    startInterview,
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
    reviewDraft,
    retryIndex,
    controls,
    session,
    sessionMeta,
    overallSummary,
    usage,
    saveStatus,
    retrySave,
    restart,
    retryResults,
    weakestIndex,
    startRetry,
    cancelRetry,
  })
}