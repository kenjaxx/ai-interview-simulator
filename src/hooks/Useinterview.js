import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useSpeechRecognition } from "./useSpeechRecognition"
import { useTextToSpeech } from "./useTextToSpeech"
import { useAudioLevel } from "./useAudioLevel"
import { useMicPermission } from "./useMicPermission"
import { evaluateSession, fetchUsage, generateQuestions } from "../lib/gemini"
import { pickQuestions, getRecentQuestions, rememberQuestions } from "../lib/questions"
import { countFillers } from "../lib/fillers"
import { findWeakestIndex } from "../lib/scores"
import { getSupport, voiceAvailable } from "../lib/support"
import { newSessionId, saveSession } from "../lib/history"
import { ROLES } from "../lib/Options"
import { readStored, writeStored } from "../lib/Storage"
import { messageForError } from "../lib/errorMessages"

export const QUESTION_COUNT = 6
// Job-description questions. Keep MIN/MAX in step with api/evaluate.js.
export const JD_QUESTION_COUNT = 3
export const MIN_JD_CHARS = 40
export const MAX_JD_CHARS = 4000
const MODE_STORAGE_KEY = "interview-ai-mode"

// Owns everything about running an interview: setup choices, speech in/out, the question loop,
// scoring, retrying a weak answer, the AI quota meter, and saving. App.jsx and the screen
// components only render what this returns.
//
// Returns { screen, setScreen, setup, interview, summary }.
export function useInterview({ user, authLoading }) {
  const uid = user?.uid

  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary" | "history"
  const [role, setRole] = useState(ROLES[0])
  const [seniority, setSeniority] = useState("Mid-level")
  const [aiMode, setAiMode] = useState(() => (readStored(MODE_STORAGE_KEY) === "full" ? "full" : "practice"))
  // What the user picked on the setup screen. The mode actually used also depends on browser support.
  const [inputPref, setInputPref] = useState("voice")
  const [notice, setNotice] = useState(null)
  const [jobDescription, setJobDescription] = useState("")
  const [starting, setStarting] = useState(false) // true while tailored questions are being generated
  const [sessionNote, setSessionNote] = useState(null) // shown during the interview (e.g. "3 questions are tailored...")

  // { remaining, limit, globalExhausted } from the server, or null while unknown.
  const [quota, setQuota] = useState(null)
  const [quotaStatus, setQuotaStatus] = useState("idle") // "idle" | "loading" | "ready" | "error"

  const [orbState, setOrbState] = useState("idle") // "idle" | "listening" | "thinking" | "speaking"
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionTotal, setQuestionTotal] = useState(QUESTION_COUNT)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [inputMode, setInputMode] = useState("voice") // how the interview in progress is answered
  const [session, setSession] = useState([])
  const [overallSummary, setOverallSummary] = useState("")
  const [saveStatus, setSaveStatus] = useState("idle") // "idle" | "saving" | "saved" | "error"
  const [error, setError] = useState(null)
  // True while a score is being computed (the whole interview, or a retried answer).
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)
  // { remaining, limit } from the last Full AI evaluation, or null (Practice Mode / not yet scored).
  const [usage, setUsage] = useState(null)
  // Locked in when the interview starts, so toggling the switch mid-interview
  // never changes how the session already in progress gets scored.
  const [sessionMode, setSessionMode] = useState("practice")

  // Retry flow: which answer (by index) is being re-answered, and the results so far.
  const [retryIndex, setRetryIndex] = useState(null)
  const [retryResults, setRetryResults] = useState({}) // index -> { answer, inputMethod, metrics, evaluation, mode }

  const promptShownAtRef = useRef(null)
  const questionsRef = useRef([])
  const questionIndexRef = useRef(0)
  const currentQuestionRef = useRef("")
  const qasRef = useRef([])
  const inputModeRef = useRef("voice")
  const pendingSaveRef = useRef(null) // { sessionId, data } for the finished session, kept for retries
  // Role, seniority and mode are locked in at startInterview() and read from here by the
  // scoring call. This is what keeps scoring from using stale values from an old render.
  const sessionConfigRef = useRef({ role: ROLES[0], seniority: "Mid-level", mode: "practice" })
  // Bumped whenever an interview starts or is torn down, so late async results
  // (e.g. a scoring response arriving after sign-out) can be recognized as stale and dropped.
  const interviewIdRef = useRef(0)
  // Same idea for the retry flow: bumped when a retry starts or is cancelled.
  const retryRunRef = useRef(0)
  const retryIndexRef = useRef(null)
  const retryAttemptRef = useRef(null) // { question, answer, metrics, inputMethod } waiting to be scored
  const retryModeRef = useRef("practice") // "practice" | "full" for the retry in progress
  // Always points at the right answer handler (main flow or retry flow). Speech callbacks call
  // through this ref, which breaks the presentQuestion <-> handleAnswer dependency cycle without
  // stale closures.
  const answerRouterRef = useRef(() => {})

  const [support] = useState(getSupport)
  const mic = useMicPermission()
  const voiceOk = voiceAvailable(support, mic.state)
  const setupMode = voiceOk && inputPref === "voice" ? "voice" : "text"

  const {
    isListening,
    subscribeTranscript,
    getTranscript,
    startListening,
    finishAnswer,
    stopListening,
  } = useSpeechRecognition()
  const { speak, stop: stopSpeaking, isSpeaking, isSupported: ttsSupported, subscribeWord } = useTextToSpeech()
  // The mic stream is opened once per interview (acquireMic is idempotent) and released at the end.
  // getLevel is polled by the Orb directly, so mic volume never causes a re-render.
  const { getLevel, acquireMic, releaseMic } = useAudioLevel()

  // ---------- quota ----------

  // Full AI is blocked only when the server says so. While the quota is unknown (loading, failed),
  // Full AI stays available and the server enforces the limit anyway.
  const quotaExhausted = !!quota && (quota.remaining <= 0 || quota.globalExhausted)
  // The stored preference is kept as-is, but the mode actually used drops to Practice while exhausted.
  const effectiveMode = aiMode === "full" && !quotaExhausted ? "full" : "practice"
  // Tailored questions cost one evaluation and scoring needs another, so require two.
  const jdAvailable = effectiveMode === "full" && (!quota || quota.remaining >= 2)

  const applyUsage = useCallback((info) => {
    if (!info) return
    setQuota({ remaining: info.remaining, limit: info.limit, globalExhausted: false })
  }, [])

  const refreshQuota = useCallback(async () => {
    if (!uid) return
    setQuotaStatus("loading")
    try {
      const latest = await fetchUsage()
      if (latest) setQuota(latest)
      setQuotaStatus("ready")
    } catch (err) {
      console.error("Couldn't load AI quota:", err)
      setQuotaStatus("error")
    }
  }, [uid])

  // Refresh whenever the setup screen is shown (first load, and after finishing an interview).
  useEffect(() => {
    if (uid && screen === "setup") refreshQuota()
  }, [uid, screen, refreshQuota])

  useEffect(() => {
    writeStored(MODE_STORAGE_KEY, aiMode)
  }, [aiMode])

  // ---------- saving to history ----------

  const runSave = useCallback(async (interviewId) => {
    const pending = pendingSaveRef.current
    if (!pending || !uid) return
    setSaveStatus("saving")
    try {
      await saveSession(uid, pending.sessionId, pending.data)
      if (interviewIdRef.current === interviewId) setSaveStatus("saved")
    } catch (err) {
      console.error("Couldn't save session:", err)
      if (interviewIdRef.current === interviewId) setSaveStatus("error")
    }
  }, [uid])

  const queueSave = useCallback((data, interviewId) => {
    if (!uid) return
    pendingSaveRef.current = { sessionId: newSessionId(uid), data }
    runSave(interviewId)
  }, [uid, runSave])

  // ---------- speech callbacks ----------

  // User pressed "I'm done" (or the backstop fired) but nothing was captured.
  const handleEmptyAnswer = useCallback(() => {
    setOrbState("idle")
    setError("We didn't catch any speech. Check that your microphone is working and try again, or type your answer instead.")
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
      onFinal: (answerText, metrics) => answerRouterRef.current(answerText, metrics, "voice"),
      onEmpty: handleEmptyAnswer,
      onError: handleListenError,
    })
  }, [startListening, handleEmptyAnswer, handleListenError])

  const presentQuestion = useCallback((question) => {
    // Stop listening first, otherwise the recognizer would transcribe the question being read aloud.
    stopListening()
    setCurrentQuestion(question)
    currentQuestionRef.current = question
    setOrbState("speaking")

    // Opens the mic on the first question (or retries if it failed earlier); no-op afterwards.
    // Not awaited: the level meter is cosmetic and must never block the interview.
    if (inputModeRef.current === "voice") acquireMic()

    speak(question, beginAnswering)
  }, [stopListening, speak, acquireMic, beginAnswering])

  // ---------- flow ----------

  // Tears everything down: speech, recognition, mic stream, and any in-flight scoring.
  const restart = useCallback(() => {
    interviewIdRef.current++
    retryRunRef.current++
    stopSpeaking()
    stopListening()
    releaseMic()
    setScreen("setup")
    qasRef.current = []
    questionsRef.current = []
    questionIndexRef.current = 0
    pendingSaveRef.current = null
    retryIndexRef.current = null
    retryAttemptRef.current = null
    setRetryIndex(null)
    setRetryResults({})
    setQuestionIndex(0)
    setAnsweredCount(0)
    setSession([])
    setOverallSummary("")
    setUsage(null)
    setSaveStatus("idle")
    setCurrentQuestion("")
    currentQuestionRef.current = ""
    setOrbState("idle")
    setError(null)
    setNotice(null)
    setSessionNote(null)
    setStarting(false)
    setAwaitingFinalScore(false)
  }, [stopSpeaking, stopListening, releaseMic])

  // forceMode lets the user re-score a finished interview locally when the AI is unavailable.
  const runFinalScoring = useCallback(async (forceMode) => {
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
      const { evaluations, overallSummary: summaryText, usage: usageInfo } = await evaluateSession({
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
        metrics: qa.metrics,
        evaluation: evaluations[i],
      }))

      setSession(finalSession)
      setOverallSummary(summaryText || "")
      setUsage(mode === "full" ? usageInfo : null)
      if (mode === "full") applyUsage(usageInfo)
      setScreen("summary")
      setOrbState("idle")
      setAwaitingFinalScore(false)

      queueSave(
        { role: config.role, seniority: config.seniority, mode, overallSummary: summaryText || "", session: finalSession },
        interviewId
      )
    } catch (err) {
      if (interviewIdRef.current !== interviewId) return
      console.error("Failed to score the session:", err)
      setError(messageForError(err))
      setOrbState("idle")
    }
  }, [releaseMic, queueSave, applyUsage])

  // Called when the last question is done, or the user ends early.
  const finishInterview = useCallback(() => {
    if (qasRef.current.length === 0) {
      restart()
      setNotice("You didn't answer any questions, so there was nothing to score. Start again whenever you're ready.")
      return
    }
    runFinalScoring()
  }, [restart, runFinalScoring])

  // Moves on to the next question, or finishes if that was the last one.
  const advance = useCallback(() => {
    const next = questionIndexRef.current + 1
    if (next >= questionsRef.current.length) {
      finishInterview()
      return
    }
    questionIndexRef.current = next
    setQuestionIndex(next)
    presentQuestion(questionsRef.current[next])
  }, [finishInterview, presentQuestion])

  const handleAnswer = useCallback((answerText, metrics, inputMethod = "voice") => {
    setError(null)

    const updated = [
      ...qasRef.current,
      { question: currentQuestionRef.current, answer: answerText, metrics, inputMethod },
    ]
    qasRef.current = updated
    setAnsweredCount(updated.length)

    advance()
  }, [advance])

  // ---------- retrying the weakest answer ----------

  // Scores the re-answered question on its own. The original session (and its saved history entry)
  // is left untouched: the retry result is shown next to it for comparison.
  const runRetryScoring = useCallback(async (forceMode) => {
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
  }, [releaseMic, applyUsage])

  const handleRetryAnswer = useCallback((answerText, metrics, inputMethod = "voice") => {
    setError(null)
    retryAttemptRef.current = { question: currentQuestionRef.current, answer: answerText, metrics, inputMethod }
    runRetryScoring()
  }, [runRetryScoring])

  useEffect(() => {
    answerRouterRef.current = (answerText, metrics, inputMethod) => {
      if (retryIndexRef.current !== null) handleRetryAnswer(answerText, metrics, inputMethod)
      else handleAnswer(answerText, metrics, inputMethod)
    }
  }, [handleAnswer, handleRetryAnswer])

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

  // ---------- starting an interview ----------

  const startInterview = async () => {
    if (starting) return

    // Capture the setup choices now: the user could touch the form while questions are generated.
    const mode = effectiveMode
    const chosenRole = role
    const chosenSeniority = seniority
    const jd = jobDescription.trim()
    const useJd = jdAvailable && jd.length >= MIN_JD_CHARS

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

    sessionConfigRef.current = { role: chosenRole, seniority: chosenSeniority, mode }
    inputModeRef.current = setupMode
    qasRef.current = []
    pendingSaveRef.current = null
    retryIndexRef.current = null
    retryAttemptRef.current = null
    retryRunRef.current++

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
    setOverallSummary("")
    setUsage(null)
    setSaveStatus("idle")
    setRetryIndex(null)
    setRetryResults({})
    setError(null)
    setNotice(null)
    setSessionNote(note)
    setAwaitingFinalScore(false)
    setScreen("interview")

    presentQuestion(questions[0])
  }

  // ---------- interview controls ----------

  const retry = () => {
    setError(null)
    if (awaitingFinalScore) {
      if (retryIndexRef.current !== null) runRetryScoring()
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
    if (retryIndexRef.current !== null) runRetryScoring("practice")
    else runFinalScoring("practice")
  }

  const retrySave = () => runSave(interviewIdRef.current)

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) {
      restart()
      setQuota(null)
      setQuotaStatus("idle")
    }
  }, [user, authLoading, restart])

  // The weakest answer that hasn't been retried yet (-1 when there's nothing left to retry).
  const weakestIndex = useMemo(
    () => findWeakestIndex(session, new Set(Object.keys(retryResults).map(Number))),
    [session, retryResults]
  )

  return {
    screen,
    setScreen,

    setup: {
      role,
      setRole,
      seniority,
      setSeniority,
      aiMode: effectiveMode,
      setAiMode,
      quota,
      quotaStatus,
      quotaExhausted,
      refreshQuota,
      jobDescription,
      setJobDescription,
      jdAvailable,
      starting,
      setupMode,
      setInputPref,
      support,
      mic,
      notice,
      questionCount: QUESTION_COUNT,
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
      isRetry: retryIndex !== null,
      retryQuestionNumber: retryIndex !== null ? retryIndex + 1 : null,
      voiceOk,
      ttsSupported,
      isListening,
      getLevel,
      subscribeWord,
      subscribeTranscript,
      getTranscript,
      finishAnswer,
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