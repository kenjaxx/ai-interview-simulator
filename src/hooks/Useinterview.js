import { useState, useCallback, useRef, useEffect } from "react"
import { useSpeechRecognition } from "./useSpeechRecognition"
import { useTextToSpeech } from "./useTextToSpeech"
import { useAudioLevel } from "./useAudioLevel"
import { useMicPermission } from "./useMicPermission"
import { evaluateSession } from "../lib/gemini"
import { pickQuestions } from "../lib/questions"
import { countFillers } from "../lib/fillers"
import { getSupport, voiceAvailable } from "../lib/support"
import { newSessionId, saveSession } from "../lib/history"
import { ROLES } from "../lib/Options"
import { readStored, writeStored } from "../lib/Storage"
import { messageForError } from "../lib/errorMessages"

export const QUESTION_COUNT = 6
const MODE_STORAGE_KEY = "interview-ai-mode"

// Owns everything about running an interview: setup choices, speech in/out, the question loop,
// scoring and saving. App.jsx and the screen components only render what this returns.
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
  const pendingSaveRef = useRef(null) // { sessionId, data } for the finished session, kept for retries
  // Role, seniority and mode are locked in at startInterview() and read from here by the
  // scoring call. This is what keeps scoring from using stale values from an old render.
  const sessionConfigRef = useRef({ role: ROLES[0], seniority: "Mid-level", mode: "practice" })
  // Bumped whenever an interview starts or is torn down, so late async results
  // (e.g. a scoring response arriving after sign-out) can be recognized as stale and dropped.
  const interviewIdRef = useRef(0)
  // Always points at the latest handleAnswer. Speech callbacks call through this ref, which
  // breaks the presentQuestion <-> handleAnswer dependency cycle without stale closures.
  const handleAnswerRef = useRef(() => {})

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
      onFinal: (answerText, metrics) => handleAnswerRef.current(answerText, metrics, "voice"),
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
    stopSpeaking()
    stopListening()
    releaseMic()
    setScreen("setup")
    qasRef.current = []
    questionsRef.current = []
    questionIndexRef.current = 0
    pendingSaveRef.current = null
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
  }, [releaseMic, queueSave])

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

  useEffect(() => {
    handleAnswerRef.current = handleAnswer
  }, [handleAnswer])

  const startInterview = () => {
    interviewIdRef.current++
    sessionConfigRef.current = { role, seniority, mode: aiMode }
    inputModeRef.current = setupMode
    qasRef.current = []
    pendingSaveRef.current = null

    const questions = pickQuestions(role, seniority, QUESTION_COUNT)
    questionsRef.current = questions
    questionIndexRef.current = 0

    setInputMode(setupMode)
    setSessionMode(aiMode)
    setQuestionIndex(0)
    setQuestionTotal(questions.length)
    setAnsweredCount(0)
    setSession([])
    setOverallSummary("")
    setUsage(null)
    setSaveStatus("idle")
    setError(null)
    setNotice(null)
    setAwaitingFinalScore(false)
    setScreen("interview")

    presentQuestion(questions[0])
  }

  // ---------- interview controls ----------

  const retry = () => {
    setError(null)
    if (awaitingFinalScore) {
      runFinalScoring()
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
    handleAnswer(text, { wpm: 0, fillerCount: countFillers(text), responseDelaySec: 0 }, "text")
  }

  const scoreWithPractice = () => runFinalScoring("practice")

  const retrySave = () => runSave(interviewIdRef.current)

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) restart()
  }, [user, authLoading, restart])

  return {
    screen,
    setScreen,

    setup: {
      role,
      setRole,
      seniority,
      setSeniority,
      aiMode,
      setAiMode,
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
    },
  }
}