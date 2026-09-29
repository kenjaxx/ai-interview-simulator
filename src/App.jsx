import { useState, useCallback, useRef, useEffect } from "react"
import Orb from "./components/Orb"
import Header from "./components/Header"
import Login from "./components/Login"
import ModeToggle from "./components/ModeToggle"
import AnswerModePicker from "./components/AnswerModePicker"
import SessionReview from "./components/SessionReview"
import HistoryScreen from "./components/HistoryScreen"
import { useAuth } from "./context/AuthContext"
import { useSpeechRecognition } from "./hooks/useSpeechRecognition"
import { useTextToSpeech } from "./hooks/useTextToSpeech"
import { useAudioLevel } from "./hooks/useAudioLevel"
import { useMicPermission } from "./hooks/useMicPermission"
import { evaluateSession } from "./lib/gemini"
import { pickQuestions } from "./lib/questions"
import { countFillers } from "./lib/fillers"
import { getSupport, voiceAvailable } from "./lib/support"
import { newSessionId, saveSession } from "./lib/history"
import "./App.css"

const QUESTION_COUNT = 6
const MODE_STORAGE_KEY = "interview-ai-mode"

const ROLE_OPTIONS = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst / Data Scientist",
  "QA / Test Engineer",
  "Tech Support / IT Support",
  "Product Manager",
  "UI/UX Designer",
]

function messageForError(err) {
  if (err?.status === 401) {
    return "Your session expired. Please sign out and sign in again."
  }

  if (err?.isQuotaError) {
    // Your personal daily allowance is used up
    if (err.limitScope === "user" && err.isDailyQuota) {
      return "You've used all of your AI evaluations for today. They reset at midnight UTC — you can score this session with Practice Mode instead."
    }
    // The whole app's daily budget is used up
    if (err.limitScope === "global") {
      return "The app's daily AI budget has been used up. Score this session with Practice Mode, or come back tomorrow."
    }
    // Gemini's own daily quota
    if (err.isDailyQuota) {
      return "The AI service has hit its daily request limit. It resets at midnight Pacific Time — you can score this session with Practice Mode instead."
    }
    return err.retryAfterSeconds
      ? `Too many requests right now — try again in about ${err.retryAfterSeconds}s.`
      : "You've hit the AI request limit for now. Please wait a bit and try again."
  }

  if (err?.status === 503) {
    return "Couldn't check your usage limit right now. Please try again in a moment."
  }

  return "Couldn't reach the interviewer AI. Check your connection and try again."
}

export default function App() {
  const { user, authLoading } = useAuth()
  const uid = user?.uid

  const [screen, setScreen] = useState("setup") // "setup" | "interview" | "summary" | "history"
  const [role, setRole] = useState(ROLE_OPTIONS[0])
  const [seniority, setSeniority] = useState("Mid-level")
  const [aiMode, setAiMode] = useState(() => {
    if (typeof window === "undefined") return "practice"
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "full" ? "full" : "practice"
  })
  // What the user picked on the setup screen. The mode actually used also depends on browser support.
  const [inputPref, setInputPref] = useState("voice")
  const [notice, setNotice] = useState(null)

  const [orbState, setOrbState] = useState("idle") // "idle" | "listening" | "thinking" | "speaking"
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionTotal, setQuestionTotal] = useState(QUESTION_COUNT)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [inputMode, setInputMode] = useState("voice") // how the interview in progress is answered
  const [typedAnswer, setTypedAnswer] = useState("")
  const [session, setSession] = useState([])
  const [overallSummary, setOverallSummary] = useState("")
  const [saveStatus, setSaveStatus] = useState("idle") // "idle" | "saving" | "saved" | "error"
  const [error, setError] = useState(null)
  const [awaitingFinalScore, setAwaitingFinalScore] = useState(false)
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
  const sessionConfigRef = useRef({ role: ROLE_OPTIONS[0], seniority: "Mid-level", mode: "practice" })
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

  const { isListening, transcript, startListening, finishAnswer, stopListening } = useSpeechRecognition()
  const { speak, stop: stopSpeaking, isSpeaking, isSupported: ttsSupported, wordTick } = useTextToSpeech()
  // The mic stream is opened once per interview (acquireMic is idempotent) and released at the end.
  // getLevel is polled by the Orb directly, so mic volume never causes an App re-render.
  const { getLevel, acquireMic, releaseMic } = useAudioLevel()

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, aiMode)
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
    setTypedAnswer("")
    setSession([])
    setOverallSummary("")
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
      const { evaluations, overallSummary: summaryText } = await evaluateSession({
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
    setTypedAnswer("")
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
    setTypedAnswer("")
    setSession([])
    setOverallSummary("")
    setSaveStatus("idle")
    setError(null)
    setNotice(null)
    setAwaitingFinalScore(false)
    setScreen("interview")

    presentQuestion(questions[0])
  }

  // ---------- interview controls ----------

  const retryCurrentQuestion = () => {
    setError(null)
    if (awaitingFinalScore) {
      runFinalScoring()
    } else {
      presentQuestion(currentQuestionRef.current)
    }
  }

  // Reads the question again. Any answer in progress is discarded, since the mic has to be off while it speaks.
  const replayQuestion = () => {
    setError(null)
    presentQuestion(currentQuestionRef.current)
  }

  // Throws away what was said so far and starts listening again, without re-reading the question.
  const reRecord = () => {
    setError(null)
    stopSpeaking()
    beginAnswering()
  }

  const skipQuestion = () => {
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

  const submitTyped = () => {
    const text = typedAnswer.trim()
    if (!text) return
    stopSpeaking()
    // Typed answers have no pace or response delay, so those are left at 0 and flagged via inputMethod.
    handleAnswer(text, { wpm: 0, fillerCount: countFillers(text), responseDelaySec: 0 }, "text")
  }

  // If the user signs out mid-interview, App stays mounted, so the question would keep being read
  // aloud and the mic would start listening behind the login screen. Tear everything down instead.
  useEffect(() => {
    if (!authLoading && !user) restart()
  }, [user, authLoading, restart])

  // ---------- render ----------

  if (authLoading) {
    return (
      <div className="page-loading">
        <div className="page-loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (screen === "history") {
    return (
      <div className="page">
        <Header />
        <HistoryScreen uid={user.uid} onBack={() => setScreen("setup")} />
      </div>
    )
  }

  if (screen === "setup") {
    return (
      <div className="page">
        <Header onHistory={() => setScreen("history")} />
        <header className="hero">
          <p className="eyebrow">AI Interview Coach</p>
          <h1>Practice out loud.<br />Get real feedback.</h1>
          <p className="hero-sub">
            A live, voice-driven mock interview. Answer out loud, and once you're
            done the AI scores your content, clarity, and confidence based on what you actually said.
          </p>
        </header>

        <div className="setup-card">
          {notice && <p className="setup-notice" role="status">{notice}</p>}

          <div className="field">
            <label htmlFor="role">Target role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="seniority">Seniority</label>
            <select id="seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option>Entry-level</option>
              <option>Mid-level</option>
              <option>Senior</option>
            </select>
          </div>

          <AnswerModePicker value={setupMode} onChange={setInputPref} support={support} mic={mic} />

          <ModeToggle mode={aiMode} onChange={setAiMode} />

          <button className="primary-btn" onClick={startInterview}>Start interview</button>
          <p className="setup-note">
            {setupMode === "voice"
              ? `You'll need microphone access — ${QUESTION_COUNT} questions, spoken answers.`
              : `${QUESTION_COUNT} questions, typed answers.`}
          </p>
          <p className="setup-note">
            Privacy: speech-to-text is done by your browser, and Chrome and Edge send audio to their
            own cloud services for that. In Full AI Mode, your answers are also sent to Google's Gemini
            API for scoring. Finished sessions, including your answers, are saved to your account so you
            can track progress, and you can delete any of them from History.
          </p>
        </div>
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <div className="page">
        <Header />
        <div className="interview-shell">
          <p className="progress-label">
            {awaitingFinalScore
              ? "Scoring your interview…"
              : `Question ${Math.min(questionIndex + 1, questionTotal)} of ${questionTotal} · ${answeredCount} answered`}
          </p>

          <Orb state={orbState} getLevel={getLevel} wordTick={wordTick} />

          {!awaitingFinalScore && <p className="question-text">{currentQuestion}</p>}

          {!ttsSupported && !awaitingFinalScore && (
            <p className="inline-note">This browser can't read questions aloud, so they're shown on screen only.</p>
          )}

          {!awaitingFinalScore && inputMode === "voice" && isListening && (
            <div className="listening-panel">
              <p className="live-transcript">{transcript || "Listening…"}</p>
              <button className="finish-btn" onClick={finishAnswer}>
                ✓ I'm done — submit answer
              </button>
            </div>
          )}

          {!awaitingFinalScore && inputMode === "text" && (
            <div className="typing-panel">
              <label htmlFor="typed-answer" className="sr-only">Your answer</label>
              <textarea
                id="typed-answer"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                placeholder="Type your answer here…"
                rows={6}
                maxLength={4000}
              />
              <button className="finish-btn" onClick={submitTyped} disabled={!typedAnswer.trim()}>
                Submit answer
              </button>
            </div>
          )}

          {error && (
            <div className="error-panel" role="alert">
              <p>{error}</p>
              <div className="error-actions">
                <button className="secondary-btn" onClick={retryCurrentQuestion}>
                  {awaitingFinalScore ? "Retry scoring" : "Retry this question"}
                </button>
                {!awaitingFinalScore && inputMode === "voice" && (
                  <button className="secondary-btn" onClick={switchToText}>Type instead</button>
                )}
                {awaitingFinalScore && sessionMode === "full" && (
                  <button className="secondary-btn" onClick={() => runFinalScoring("practice")}>
                    Score with Practice Mode
                  </button>
                )}
              </div>
            </div>
          )}

          {!awaitingFinalScore && (
            <div className="interview-controls">
              <button className="secondary-btn" onClick={replayQuestion} disabled={!ttsSupported}>
                Replay question
              </button>
              {inputMode === "voice" && (
                <button className="secondary-btn" onClick={reRecord} disabled={!isListening}>
                  Re-record
                </button>
              )}
              <button className="secondary-btn" onClick={skipQuestion}>Skip</button>
              {inputMode === "voice" ? (
                <button className="secondary-btn" onClick={switchToText}>Type instead</button>
              ) : (
                voiceOk && <button className="secondary-btn" onClick={switchToVoice}>Use voice</button>
              )}
              <button className="secondary-btn secondary-btn--danger" onClick={endEarly}>
                {answeredCount > 0 ? "End & score" : "Quit"}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // summary screen
  return (
    <div className="page">
      <Header onHistory={() => setScreen("history")} />
      <div className="summary-shell">
        <div className="summary-heading-row">
          <h1>Session summary</h1>
          <span className={`mode-badge ${sessionMode === "full" ? "mode-badge--full" : ""}`}>
            {sessionMode === "full" ? "Full AI Mode" : "Practice Mode"}
          </span>
        </div>

        {overallSummary && <p className="hero-sub" style={{ margin: "0 0 1.75rem", textAlign: "left" }}>{overallSummary}</p>}

        <SessionReview session={session} />

        <div className="save-status" role="status">
          {saveStatus === "saving" && <span>Saving to your history…</span>}
          {saveStatus === "saved" && <span>Saved to your history.</span>}
          {saveStatus === "error" && (
            <>
              <span>Couldn't save this session to your history.</span>
              <button className="secondary-btn" onClick={() => runSave(interviewIdRef.current)}>Retry save</button>
            </>
          )}
        </div>

        <div className="summary-actions">
          <button className="primary-btn" onClick={restart}>Practice again</button>
          <button className="secondary-btn" onClick={() => setScreen("history")}>View history</button>
        </div>
      </div>
    </div>
  )
}